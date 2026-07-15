// =============================================================================
// main/ipc/banks.js — إدارة البنوك وقوالب الطباعة
// =============================================================================

const supabaseService = require('../services/supabaseService');

module.exports = function registerBanks(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  ipcMain.handle('banks:list', () =>
    database.prepare('SELECT * FROM banks ORDER BY name_ar').all()
  );

  ipcMain.handle('banks:create', (_e, data) => {
    try {
      const now = db.nowISO();
      const info = database
        .prepare(
          `INSERT INTO banks (name_ar, name_en, check_width_mm, check_height_mm, print_template, created_at, updated_at)
           VALUES (@name_ar,@name_en,@check_width_mm,@check_height_mm,@print_template,@created_at,@updated_at)`
        )
        .run({
          name_ar: String(data.name_ar || '').trim(),
          name_en: data.name_en || null,
          check_width_mm: Number(data.check_width_mm) || 175,
          check_height_mm: Number(data.check_height_mm) || 80,
          print_template: data.print_template || '{}',
          created_at: now,
          updated_at: now,
        });
      const id = info.lastInsertRowid;
      const row = database.prepare('SELECT * FROM banks WHERE id = ?').get(id);
      db.audit('bank', 'created', id, row);
      db.enqueueSync('upsert', 'banks', id, row);
      supabaseService.tryUpsert('banks', row).catch(() => {});
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('banks:update', (_e, payload) => {
    try {
      const { id, ...changes } = payload || {};
      const before = database.prepare('SELECT * FROM banks WHERE id = ?').get(id);
      if (!before) return { ok: false, error: 'البنك غير موجود' };
      const now = db.nowISO();
      database
        .prepare(
          `UPDATE banks SET name_ar=@name_ar, name_en=@name_en,
             check_width_mm=@check_width_mm, check_height_mm=@check_height_mm, updated_at=@now
           WHERE id=@id`
        )
        .run({
          id,
          name_ar: changes.name_ar ?? before.name_ar,
          name_en: changes.name_en ?? before.name_en,
          check_width_mm: Number(changes.check_width_mm ?? before.check_width_mm),
          check_height_mm: Number(changes.check_height_mm ?? before.check_height_mm),
          now,
        });
      const row = database.prepare('SELECT * FROM banks WHERE id = ?').get(id);
      db.audit('bank', 'updated', id, { before, after: row });
      db.enqueueSync('upsert', 'banks', id, row);
      supabaseService.tryUpsert('banks', row).catch(() => {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('banks:delete', (_e, id) => {
    try {
      const used = database.prepare('SELECT COUNT(*) AS n FROM checks WHERE bank_id = ?').get(id);
      if (used && used.n > 0) {
        return { ok: false, error: `لا يمكن الحذف: يوجد ${used.n} شيك مرتبط بهذا البنك` };
      }
      database.prepare('DELETE FROM banks WHERE id = ?').run(id);
      db.audit('bank', 'deleted', id, {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('banks:saveTemplate', (_e, payload) => {
    try {
      const { id, template } = payload || {};
      const now = db.nowISO();
      const json = typeof template === 'string' ? template : JSON.stringify(template || {});
      database.prepare('UPDATE banks SET print_template=?, updated_at=? WHERE id=?').run(json, now, id);
      const row = database.prepare('SELECT * FROM banks WHERE id = ?').get(id);
      db.audit('bank', 'updated', id, { print_template: 'updated' });
      db.enqueueSync('upsert', 'banks', id, row);
      supabaseService.tryUpsert('banks', row).catch(() => {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
