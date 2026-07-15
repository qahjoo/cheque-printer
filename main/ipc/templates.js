// =============================================================================
// main/ipc/templates.js — إدارة القوالب (Template + TemplateField)
// list / get / create / update / saveFields / rename / duplicate / delete /
// setDefault / getDefault.
// Every write: audit_log + sync_queue + best-effort Supabase upsert.
// =============================================================================

const supabaseService = require('../services/supabaseService');

// Canonical printable fields a template may contain.
const FIELD_NAMES = ['payee', 'amount_words', 'amount_number', 'amount_fils', 'date', 'purpose', 'cheque_number', 'crossed'];

// amount_fils: the fils/cents part printed in the small box (3 digits, LTR)
const DEFAULT_FIELDS = {
  payee:         { x_mm: 20,  y_mm: 32, font_family: 'Cairo', font_size: 12, align: 'right', direction: 'rtl' },
  amount_words:  { x_mm: 60,  y_mm: 39, font_family: 'Cairo', font_size: 11, align: 'right', direction: 'rtl' },
  amount_number: { x_mm: 50,  y_mm: 45, font_family: 'Arial', font_size: 13, align: 'left',  direction: 'ltr' },
  amount_fils:   { x_mm: 30,  y_mm: 45, font_family: 'Arial', font_size: 13, align: 'left',  direction: 'ltr' },
  date:          { x_mm: 125, y_mm: 18, font_family: 'Arial', font_size: 12, align: 'left',  direction: 'ltr' },
  purpose:       { x_mm: 20,  y_mm: 55, font_family: 'Cairo', font_size: 11, align: 'right', direction: 'rtl' },
  cheque_number: { x_mm: 20,  y_mm: 15, font_family: 'Arial', font_size: 12, align: 'left',  direction: 'ltr' },
  crossed:       { x_mm: 140, y_mm: 10, font_family: 'Arial', font_size: 12, align: 'left',  direction: 'ltr' },
};

module.exports = function registerTemplates(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  const getFields = (templateId) =>
    database
      .prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY id')
      .all(templateId)
      .map((f) => ({ ...f, visible: !!f.visible }));

  const insertField = database.prepare(
    `INSERT INTO template_fields
       (template_id, field_name, x_mm, y_mm, font_family, font_size, font_weight, color, align, direction, visible)
     VALUES (@template_id,@field_name,@x_mm,@y_mm,@font_family,@font_size,@font_weight,@color,@align,@direction,@visible)`
  );

  const seedFields = (templateId) => {
    for (const name of FIELD_NAMES) {
      const d = DEFAULT_FIELDS[name];
      insertField.run({
        template_id: templateId,
        field_name: name,
        x_mm: d.x_mm, y_mm: d.y_mm,
        font_family: d.font_family, font_size: d.font_size,
        font_weight: '400', color: '#000000',
        align: d.align, direction: d.direction,
        visible: name === 'crossed' ? 0 : 1,
      });
    }
  };

  // Helper: enqueue full template row + its fields for sync
  const enqueueTemplate = (templateId) => {
    const t = database.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
    if (!t) return;
    const fields = getFields(templateId);
    db.enqueueSync('upsert', 'templates', templateId, { ...t, fields });
    supabaseService.tryUpsert('templates', { ...t, is_default: !!t.is_default }).catch(() => {});
    // Sync each field individually
    for (const f of fields) {
      db.enqueueSync('upsert', 'template_fields', f.id, f);
      supabaseService.tryUpsert('template_fields', f).catch(() => {});
    }
  };

  ipcMain.handle('templates:list', () =>
    database.prepare('SELECT * FROM templates ORDER BY is_default DESC, name').all()
      .map((t) => ({ ...t, is_default: !!t.is_default }))
  );

  ipcMain.handle('templates:get', (_e, id) => {
    const t = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!t) return null;
    return { ...t, is_default: !!t.is_default, fields: getFields(id) };
  });

  ipcMain.handle('templates:getDefault', () => {
    const t =
      database.prepare('SELECT * FROM templates WHERE is_default = 1 LIMIT 1').get() ||
      database.prepare('SELECT * FROM templates ORDER BY id LIMIT 1').get();
    if (!t) return null;
    return { ...t, is_default: !!t.is_default, fields: getFields(t.id) };
  });

  ipcMain.handle('templates:create', (_e, data = {}) => {
    try {
      const now = db.nowISO();
      const info = database
        .prepare(
          `INSERT INTO templates (name, width_mm, height_mm, background_image, is_default, created_at, updated_at)
           VALUES (@name,@width_mm,@height_mm,@background_image,0,@now,@now)`
        )
        .run({
          name: (data.name || 'قالب جديد').trim(),
          width_mm: Number(data.width_mm) || 165,
          height_mm: Number(data.height_mm) || 82,
          background_image: data.background_image || null,
          now,
        });
      const id = info.lastInsertRowid;
      seedFields(id);
      db.audit('template', 'created', id, { name: data.name, width_mm: data.width_mm, height_mm: data.height_mm });
      enqueueTemplate(id);
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('templates:update', (_e, payload) => {
    try {
      const { id } = payload;
      const t = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
      if (!t) return { ok: false, error: 'القالب غير موجود' };
      const now = db.nowISO();
      database
        .prepare(
          `UPDATE templates SET name=@name, width_mm=@width_mm, height_mm=@height_mm,
             background_image=@background_image, updated_at=@now WHERE id=@id`
        )
        .run({
          id,
          name: payload.name ?? t.name,
          width_mm: Number(payload.width_mm ?? t.width_mm),
          height_mm: Number(payload.height_mm ?? t.height_mm),
          background_image: payload.background_image !== undefined ? payload.background_image : t.background_image,
          now,
        });
      db.audit('template', 'updated', id, { name: payload.name, width_mm: payload.width_mm, height_mm: payload.height_mm });
      enqueueTemplate(id);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('templates:rename', (_e, payload) => {
    try {
      const { id, name } = payload;
      if (!name || !name.trim()) return { ok: false, error: 'الاسم مطلوب' };
      database.prepare('UPDATE templates SET name=?, updated_at=? WHERE id=?').run(name.trim(), db.nowISO(), id);
      db.audit('template', 'renamed', id, { name });
      const row = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
      db.enqueueSync('upsert', 'templates', id, row);
      supabaseService.tryUpsert('templates', { ...row, is_default: !!row.is_default }).catch(() => {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Replace all fields for a template (from the coordinate editor).
  ipcMain.handle('templates:saveFields', (_e, payload) => {
    try {
      const { templateId, fields } = payload;
      const tx = database.transaction(() => {
        database.prepare('DELETE FROM template_fields WHERE template_id = ?').run(templateId);
        for (const f of fields || []) {
          insertField.run({
            template_id: templateId,
            field_name: f.field_name,
            x_mm: Number(f.x_mm) || 0,
            y_mm: Number(f.y_mm) || 0,
            font_family: f.font_family || 'Cairo',
            font_size: Number(f.font_size) || 12,
            font_weight: String(f.font_weight || '400'),
            color: f.color || '#000000',
            align: f.align || 'right',
            direction: f.direction || 'rtl',
            visible: f.visible ? 1 : 0,
          });
        }
        database.prepare('UPDATE templates SET updated_at=? WHERE id=?').run(db.nowISO(), templateId);
      });
      tx();
      db.audit('template', 'fields_saved', templateId, { count: (fields || []).length });
      enqueueTemplate(templateId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('templates:duplicate', (_e, id) => {
    try {
      const t = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
      if (!t) return { ok: false, error: 'القالب غير موجود' };
      const now = db.nowISO();
      const info = database
        .prepare(
          `INSERT INTO templates (name, width_mm, height_mm, background_image, is_default, created_at, updated_at)
           VALUES (?,?,?,?,0,?,?)`
        )
        .run(`${t.name} (نسخة)`, t.width_mm, t.height_mm, t.background_image, now, now);
      const newId = info.lastInsertRowid;
      for (const f of getFields(id)) {
        insertField.run({ ...f, id: undefined, template_id: newId, visible: f.visible ? 1 : 0 });
      }
      db.audit('template', 'duplicated', newId, { duplicatedFrom: id, name: t.name });
      enqueueTemplate(newId);
      return { ok: true, id: newId };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('templates:delete', (_e, id) => {
    try {
      const count = database.prepare('SELECT COUNT(*) AS n FROM templates').get().n;
      if (count <= 1) return { ok: false, error: 'لا يمكن حذف القالب الوحيد' };
      const t = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
      if (!t) return { ok: false, error: 'القالب غير موجود' };

      // Enqueue deletion of fields first, then template
      const fields = getFields(id);
      for (const f of fields) {
        db.enqueueSync('delete', 'template_fields', f.id, {});
      }
      db.enqueueSync('delete', 'templates', id, {});

      database.prepare('DELETE FROM templates WHERE id = ?').run(id); // cascade fields
      if (t.is_default) {
        const next = database.prepare('SELECT id FROM templates ORDER BY id LIMIT 1').get();
        if (next) database.prepare('UPDATE templates SET is_default=1 WHERE id=?').run(next.id);
      }
      db.audit('template', 'deleted', id, { name: t.name });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('templates:setDefault', (_e, id) => {
    try {
      const now = db.nowISO();
      const tx = database.transaction(() => {
        database.prepare('UPDATE templates SET is_default=0').run();
        database.prepare('UPDATE templates SET is_default=1, updated_at=? WHERE id=?').run(now, id);
      });
      tx();
      db.audit('template', 'set_default', id, {});
      const row = database.prepare('SELECT * FROM templates WHERE id = ?').get(id);
      db.enqueueSync('upsert', 'templates', id, row);
      supabaseService.tryUpsert('templates', { ...row, is_default: true }).catch(() => {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
