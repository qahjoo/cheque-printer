// =============================================================================
// main/ipc/reports.js — التقارير + التصدير (PDF / Excel / طباعة)
// Query logic lives in the main process; renderer only triggers and receives
// data or a saved file path. Export uses pdf-lib + ExcelJS.
// =============================================================================

const fs = require('fs');
const { dialog } = require('electron');
const { buildReportPdf } = require('../services/reportPdf');
const { buildReportExcel } = require('../services/reportExcel');
const printService = require('../services/printService');

const STATUS_AR = {
  open: 'مفتوح',
  collected: 'محصّل',
  returned: 'مرتجع',
  cancelled: 'ملغي',
};

module.exports = function registerReports(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  const withBank = (rows) => rows;

  // REPORT 1 — due this week
  ipcMain.handle('reports:dueThisWeek', () => {
    const rows = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id
         WHERE c.is_deleted = 0 AND c.status = 'open'
           AND date(c.due_date) BETWEEN date('now') AND date('now','+7 days')
         ORDER BY date(c.due_date) ASC`
      )
      .all();
    // group by day
    const groups = {};
    for (const r of rows) {
      (groups[r.due_date] = groups[r.due_date] || { day: r.due_date, checks: [], total: 0 });
      groups[r.due_date].checks.push(r);
      groups[r.due_date].total += r.amount;
    }
    return {
      groups: Object.values(groups).sort((a, b) => a.day.localeCompare(b.day)),
      total: rows.reduce((s, r) => s + r.amount, 0),
      count: rows.length,
    };
  });

  // REPORT 2 — statement by payee
  ipcMain.handle('reports:byPayee', (_e, payee) => {
    const rows = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id
         WHERE c.is_deleted = 0 AND c.payee_ar = ?
         ORDER BY date(c.due_date) ASC`
      )
      .all(payee);
    const byStatus = {};
    for (const r of rows) {
      byStatus[r.status] = byStatus[r.status] || { count: 0, total: 0, label: STATUS_AR[r.status] };
      byStatus[r.status].count += 1;
      byStatus[r.status].total += r.amount;
    }
    return {
      payee,
      rows,
      count: rows.length,
      total: rows.reduce((s, r) => s + r.amount, 0),
      byStatus,
    };
  });

  // REPORT 3 — by period (issue_date or due_date)
  ipcMain.handle('reports:byPeriod', (_e, payload) => {
    const { from, to, field } = payload || {};
    const col = field === 'issue_date' ? 'issue_date' : 'due_date';
    const rows = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id
         WHERE c.is_deleted = 0 AND date(c.${col}) BETWEEN date(?) AND date(?)
         ORDER BY date(c.${col}) ASC`
      )
      .all(from, to);
    const byStatus = {};
    for (const r of rows) {
      byStatus[r.status] = byStatus[r.status] || { count: 0, total: 0, label: STATUS_AR[r.status] };
      byStatus[r.status].count += 1;
      byStatus[r.status].total += r.amount;
    }
    return { rows, from, to, field: col, count: rows.length, total: rows.reduce((s, r) => s + r.amount, 0), byStatus };
  });

  // REPORT 4 — current status summary
  ipcMain.handle('reports:statusSummary', () => {
    const rows = database
      .prepare(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM checks WHERE is_deleted = 0 GROUP BY status`
      )
      .all();
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    const totalAmount = rows.reduce((s, r) => s + r.total, 0);
    const order = ['open', 'collected', 'returned', 'cancelled'];
    const map = Object.fromEntries(rows.map((r) => [r.status, r]));
    return {
      rows: order.map((st) => {
        const r = map[st] || { count: 0, total: 0 };
        return {
          status: st,
          label: STATUS_AR[st],
          count: r.count,
          total: r.total,
          percent: Math.round((r.count / total) * 100),
        };
      }),
      totalCount: rows.reduce((s, r) => s + r.count, 0),
      totalAmount,
    };
  });

  // unique payees for the dropdown
  ipcMain.handle('reports:payees', () =>
    database
      .prepare('SELECT DISTINCT payee_ar FROM checks WHERE is_deleted = 0 ORDER BY payee_ar')
      .all()
      .map((r) => r.payee_ar)
  );

  // ---- EXPORT: PDF ----------------------------------------------------------
  ipcMain.handle('reports:exportPdf', async (_e, payload) => {
    try {
      const { defaultPath } = { defaultPath: `report-${payload.slug || 'export'}.pdf` };
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: 'حفظ التقرير PDF',
        defaultPath,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      const bytes = await buildReportPdf(payload, db.getAllSettings());
      fs.writeFileSync(filePath, bytes);
      db.audit('backup', 'exported', 'report_pdf', { filePath, count: (payload.rows || []).length });
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- EXPORT: Excel --------------------------------------------------------
  ipcMain.handle('reports:exportExcel', async (_e, payload) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: 'حفظ التقرير Excel',
        defaultPath: `report-${payload.slug || 'export'}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      await buildReportExcel(payload, db.getAllSettings(), filePath);
      db.audit('backup', 'exported', 'report_excel', { filePath, count: (payload.rows || []).length });
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- PRINT (native) -------------------------------------------------------
  ipcMain.handle('reports:print', async (_e, payload) => {
    try {
      return await printService.printReportHtml(payload, db.getAllSettings());
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
