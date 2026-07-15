// =============================================================================
// main/ipc/print.js — نطاق الطباعة
// print:check(checkId)   → طباعة شيك (يقرأ طابعة الشيكات من الإعدادات)
// print:report(payload)  → طباعة تقرير HTML (يقرأ طابعة التقارير من الإعدادات)
// print:getPrinters()    → قائمة الطابعات المتاحة في النظام
// =============================================================================

const printService = require('../services/printService');

module.exports = function registerPrint(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  // Helper — load a setting value by key.
  const getSetting = (key) => {
    const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  };

  // ---- print:check -------------------------------------------------------
  // Reads 'cheque_printer_name' from settings; if set, prints silently to that
  // device (no dialog). If empty, opens the standard print dialog.
  ipcMain.handle('print:check', async (_e, checkId) => {
    try {
      const check = database
        .prepare(
          `SELECT c.*, b.name_ar AS bank_name_ar, b.print_template,
                  b.check_width_mm, b.check_height_mm
           FROM checks c LEFT JOIN banks b ON b.id = c.bank_id
           WHERE c.id = ?`
        )
        .get(checkId);
      if (!check) return { ok: false, error: 'الشيك غير موجود' };

      const deviceName = getSetting('cheque_printer_name') || '';
      return await printService.printCheck(check, { deviceName: deviceName || null });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- print:report -------------------------------------------------------
  ipcMain.handle('print:report', async (_e, payload) => {
    try {
      const settings = {
        company_name: getSetting('company_name') || 'شهد وهبة للتمور',
      };
      const deviceName = getSetting('report_printer_name') || '';
      return await printService.printReportHtml(payload, settings, {
        deviceName: deviceName || null,
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- print:getPrinters --------------------------------------------------
  // Returns [{name, displayName, isDefault, status}] for the settings UI.
  ipcMain.handle('print:getPrinters', async () => {
    try {
      const list = await printService.getPrinters();
      return { ok: true, printers: list };
    } catch (err) {
      return { ok: false, printers: [], error: err.message };
    }
  });
};
