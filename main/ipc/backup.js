// =============================================================================
// main/ipc/backup.js — تصدير/استيراد نسخة احتياطية JSON
// Export: ALL tables → a single JSON file (user picks location).
//   banks | checks | settings | templates | template_fields | print_history
// Import: merges using primary keys — no duplicates, last-write-wins.
// =============================================================================

const fs = require('fs');
const { dialog } = require('electron');

module.exports = function registerBackup(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  ipcMain.handle('backup:export', async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.getMainWindow(), {
        title: 'تصدير نسخة احتياطية',
        defaultPath: `cheques-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };

      const data = {
        version: 2,
        exported_at: db.nowISO(),
        // Core tables
        banks:           database.prepare('SELECT * FROM banks').all(),
        checks:          database.prepare('SELECT * FROM checks').all(),
        settings:        database.prepare("SELECT * FROM settings WHERE key <> 'pin_hash'").all(),
        // Template system
        templates:       database.prepare('SELECT * FROM templates').all(),
        template_fields: database.prepare('SELECT * FROM template_fields').all(),
        // Print history
        print_history:   database.prepare('SELECT * FROM print_history').all(),
        // Audit log (read-only export — not imported to avoid immutability issues)
        audit_log:       database.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 5000').all(),
      };

      const count =
        data.banks.length +
        data.checks.length +
        data.settings.length +
        data.templates.length +
        data.template_fields.length +
        data.print_history.length;

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      db.setSetting('last_backup_at', db.nowISO());
      db.audit('backup', 'exported', filePath, { count, tables: Object.keys(data).filter((k) => k !== 'exported_at' && k !== 'version') });
      return { ok: true, filePath, count };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:import', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(ctx.getMainWindow(), {
        title: 'استيراد نسخة احتياطية',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
      const filePath = filePaths[0];

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const merged = { banks: 0, checks: 0, settings: 0, templates: 0, template_fields: 0, print_history: 0 };

      const tx = database.transaction(() => {
        // ---- banks ----
        const bankUpsert = database.prepare(
          `INSERT INTO banks (id,name_ar,name_en,check_width_mm,check_height_mm,print_template,created_at,updated_at)
           VALUES (@id,@name_ar,@name_en,@check_width_mm,@check_height_mm,@print_template,@created_at,@updated_at)
           ON CONFLICT(id) DO UPDATE SET name_ar=excluded.name_ar, name_en=excluded.name_en,
             check_width_mm=excluded.check_width_mm, check_height_mm=excluded.check_height_mm,
             print_template=excluded.print_template, updated_at=excluded.updated_at`
        );
        for (const b of data.banks || []) {
          bankUpsert.run({
            id: b.id, name_ar: b.name_ar, name_en: b.name_en || null,
            check_width_mm: b.check_width_mm, check_height_mm: b.check_height_mm,
            print_template: b.print_template || '{}',
            created_at: b.created_at || db.nowISO(), updated_at: b.updated_at || db.nowISO(),
          });
          merged.banks += 1;
        }

        // ---- checks ----
        const checkUpsert = database.prepare(
          `INSERT INTO checks
             (id,check_number,bank_id,payee_ar,payee_en,amount,amount_words_ar,currency,
              issue_date,due_date,status,collected_by,collected_at,notes,google_event_id,
              printed_at,is_deleted,deleted_reason,created_at,updated_at,synced_at)
           VALUES
             (@id,@check_number,@bank_id,@payee_ar,@payee_en,@amount,@amount_words_ar,@currency,
              @issue_date,@due_date,@status,@collected_by,@collected_at,@notes,@google_event_id,
              @printed_at,@is_deleted,@deleted_reason,@created_at,@updated_at,@synced_at)
           ON CONFLICT(id) DO UPDATE SET
             check_number=excluded.check_number, bank_id=excluded.bank_id, payee_ar=excluded.payee_ar,
             payee_en=excluded.payee_en, amount=excluded.amount, amount_words_ar=excluded.amount_words_ar,
             currency=excluded.currency, issue_date=excluded.issue_date, due_date=excluded.due_date,
             status=excluded.status, collected_by=excluded.collected_by, collected_at=excluded.collected_at,
             notes=excluded.notes, printed_at=excluded.printed_at,
             is_deleted=excluded.is_deleted, deleted_reason=excluded.deleted_reason,
             updated_at=excluded.updated_at
           WHERE excluded.updated_at >= checks.updated_at`
        );
        for (const c of data.checks || []) {
          checkUpsert.run({
            id: c.id, check_number: c.check_number, bank_id: c.bank_id,
            payee_ar: c.payee_ar, payee_en: c.payee_en || null, amount: c.amount,
            amount_words_ar: c.amount_words_ar || '', currency: c.currency || 'دينار',
            issue_date: c.issue_date, due_date: c.due_date, status: c.status || 'open',
            collected_by: c.collected_by || null, collected_at: c.collected_at || null,
            notes: c.notes || null, google_event_id: c.google_event_id || null,
            printed_at: c.printed_at || null, is_deleted: c.is_deleted ? 1 : 0,
            deleted_reason: c.deleted_reason || null,
            created_at: c.created_at || db.nowISO(), updated_at: c.updated_at || db.nowISO(),
            synced_at: c.synced_at || null,
          });
          merged.checks += 1;
        }

        // ---- settings ----
        for (const s of data.settings || []) {
          if (s.key === 'pin_hash') continue;
          db.setSetting(s.key, s.value);
          merged.settings += 1;
        }

        // ---- templates ----
        const tplUpsert = database.prepare(
          `INSERT INTO templates (id,name,width_mm,height_mm,background_image,is_default,created_at,updated_at)
           VALUES (@id,@name,@width_mm,@height_mm,@background_image,@is_default,@created_at,@updated_at)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, width_mm=excluded.width_mm,
             height_mm=excluded.height_mm, background_image=excluded.background_image,
             is_default=excluded.is_default, updated_at=excluded.updated_at
           WHERE excluded.updated_at >= templates.updated_at`
        );
        for (const t of data.templates || []) {
          tplUpsert.run({
            id: t.id, name: t.name, width_mm: t.width_mm || 165, height_mm: t.height_mm || 82,
            background_image: t.background_image || null, is_default: t.is_default ? 1 : 0,
            created_at: t.created_at || db.nowISO(), updated_at: t.updated_at || db.nowISO(),
          });
          merged.templates += 1;
        }

        // ---- template_fields ----
        const tfUpsert = database.prepare(
          `INSERT INTO template_fields (id,template_id,field_name,x_mm,y_mm,font_family,font_size,font_weight,color,align,direction,visible)
           VALUES (@id,@template_id,@field_name,@x_mm,@y_mm,@font_family,@font_size,@font_weight,@color,@align,@direction,@visible)
           ON CONFLICT(id) DO UPDATE SET x_mm=excluded.x_mm, y_mm=excluded.y_mm,
             font_family=excluded.font_family, font_size=excluded.font_size, font_weight=excluded.font_weight,
             color=excluded.color, align=excluded.align, direction=excluded.direction, visible=excluded.visible`
        );
        for (const f of data.template_fields || []) {
          tfUpsert.run({
            id: f.id, template_id: f.template_id, field_name: f.field_name,
            x_mm: f.x_mm || 0, y_mm: f.y_mm || 0,
            font_family: f.font_family || 'Cairo', font_size: f.font_size || 12,
            font_weight: f.font_weight || '400', color: f.color || '#000000',
            align: f.align || 'right', direction: f.direction || 'rtl',
            visible: f.visible ? 1 : 0,
          });
          merged.template_fields += 1;
        }

        // ---- print_history ----
        const histUpsert = database.prepare(
          `INSERT INTO print_history (id,print_date,cheque_date,payee,amount,amount_words,purpose,
             cheque_number,currency,crossed,template_id,template_name,printed_by,status,created_at)
           VALUES (@id,@print_date,@cheque_date,@payee,@amount,@amount_words,@purpose,
             @cheque_number,@currency,@crossed,@template_id,@template_name,@printed_by,@status,@created_at)
           ON CONFLICT(id) DO NOTHING`
        );
        for (const h of data.print_history || []) {
          histUpsert.run({
            id: h.id, print_date: h.print_date, cheque_date: h.cheque_date || null,
            payee: h.payee || '', amount: h.amount || 0, amount_words: h.amount_words || '',
            purpose: h.purpose || null, cheque_number: h.cheque_number || null,
            currency: h.currency || 'دينار أردني', crossed: h.crossed ? 1 : 0,
            template_id: h.template_id || null, template_name: h.template_name || null,
            printed_by: h.printed_by || 'المستخدم', status: h.status || 'printed',
            created_at: h.created_at || db.nowISO(),
          });
          merged.print_history += 1;
        }
      });
      tx();

      const count = Object.values(merged).reduce((a, b) => a + b, 0);
      db.audit('backup', 'imported', filePath, { count, ...merged });
      ctx.refreshTrayTooltip();
      return { ok: true, filePath, count, merged };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
