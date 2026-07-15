// =============================================================================
// main/ipc/settings.js — قراءة/كتابة الإعدادات (غير السرية) في SQLite
// Secrets (tokens/passwords) are NEVER stored here — they live only in .env.
// =============================================================================

const supabaseService = require('../services/supabaseService');

// Keys that must never be written to the settings table.
const FORBIDDEN = /token|password|secret|smtp_pass|anon_key|_key$/i;

module.exports = function registerSettings(ipcMain, ctx) {
  const { db } = ctx;

  ipcMain.handle('settings:getAll', () => db.getAllSettings());

  // Returns the single bank's saved print template + check dimensions.
  ipcMain.handle('settings:getPrintTemplate', () => {
    const bank = db
      .getDb()
      .prepare('SELECT id, name_ar, check_width_mm, check_height_mm, print_template FROM banks LIMIT 1')
      .get();
    if (!bank) return { ok: false, error: 'لا يوجد بنك' };
    let fields = {};
    try {
      fields = JSON.parse(bank.print_template || '{}');
    } catch {
      fields = {};
    }
    return {
      ok: true,
      bank_id: bank.id,
      bank_name: bank.name_ar,
      width_mm: bank.check_width_mm,
      height_mm: bank.check_height_mm,
      fields,
    };
  });

  const applyOne = (key, value) => {
    if (FORBIDDEN.test(key)) {
      return { key, ok: false, error: 'لا يمكن تخزين القيم السرية في قاعدة البيانات' };
    }
    const before = db.getSetting(key, null);
    db.setSetting(key, value);
    db.audit('settings', 'changed', key, { key, from: before, to: value });
    const row = { key, value: value == null ? '' : String(value), updated_at: db.nowISO() };
    db.enqueueSync('upsert', 'settings', key, row);
    supabaseService.tryUpsert('settings', row).catch(() => {});
    return { key, ok: true };
  };

  ipcMain.handle('settings:set', (_e, payload) => {
    const { key, value } = payload || {};
    if (!key) return { ok: false, error: 'المفتاح مطلوب' };
    return applyOne(key, value);
  });

  ipcMain.handle('settings:setMany', (_e, obj) => {
    const results = [];
    for (const [key, value] of Object.entries(obj || {})) {
      results.push(applyOne(key, value));
    }
    const failed = results.filter((r) => !r.ok);
    return { ok: failed.length === 0, results, failed };
  });
};
