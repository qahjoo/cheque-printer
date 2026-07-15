// =============================================================================
// main/ipc/audit.js — سجل المراجعة (قراءة مرقّمة + تصدير CSV فقط)
// The audit log is immutable (enforced by DB triggers). No delete/clear here.
// =============================================================================

const fs = require('fs');
const { dialog } = require('electron');

module.exports = function registerAudit(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  // Paginated list (default 50/page).
  ipcMain.handle('audit:list', (_e, payload = {}) => {
    const page = Math.max(parseInt(payload.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(payload.pageSize, 10) || 50, 1), 200);
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = {};
    if (payload.entity) {
      where.push('entity = @entity');
      params.entity = payload.entity;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = database.prepare(`SELECT COUNT(*) AS n FROM audit_log ${whereSql}`).get(params).n;
    const rows = database
      .prepare(
        `SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset });

    return {
      rows: rows.map((r) => ({ ...r, details: safeParse(r.details) })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  });

  ipcMain.handle('audit:exportCsv', async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: 'تصدير سجل المراجعة CSV',
        defaultPath: 'audit-log.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };

      const rows = database.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
      const header = ['id', 'created_at', 'entity', 'action', 'entity_id', 'details'];
      const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(header.map((h) => escape(r[h])).join(','));
      }
      // BOM so Excel opens Arabic UTF-8 correctly.
      fs.writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf8');
      return { ok: true, filePath, count: rows.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};

function safeParse(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
