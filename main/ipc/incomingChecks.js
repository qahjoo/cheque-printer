// =============================================================================
// main/ipc/incomingChecks.js — إدارة الشيكات الواردة
// =============================================================================

const { v4: uuidv4 } = require('uuid');
const imageService = require('../services/imageService');

module.exports = function registerIncomingChecks(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  ipcMain.handle('incoming_checks:list', (_e, filter = 'all') => {
    let query = 'SELECT * FROM incoming_checks WHERE is_deleted = 0';
    let params = [];
    if (filter !== 'all') {
      query += ' AND status = ?';
      params.push(filter);
    }
    query += ' ORDER BY due_date ASC';
    return database.prepare(query).all(...params);
  });

  ipcMain.handle('incoming_checks:get', (_e, id) => {
    const row = database.prepare('SELECT * FROM incoming_checks WHERE id = ?').get(id);
    if (row && row.image_path) {
      row.imageBase64 = imageService.readImageLocallyAsBase64(row.image_path);
    }
    return row;
  });

  ipcMain.handle('incoming_checks:create', (_e, payload) => {
    try {
      const id = uuidv4();
      const now = db.nowISO();
      
      let image_path = null;
      if (payload.imageBase64) {
        image_path = `${id}.jpg`;
        imageService.saveBase64ImageLocally(payload.imageBase64, image_path);
      }
      
      const p = {
        id,
        check_number: payload.check_number?.trim() || '',
        drawer_name: payload.drawer_name?.trim() || '',
        drawer_phone: payload.drawer_phone?.trim() || '',
        bank_name: payload.bank_name?.trim() || '',
        amount: Number(payload.amount) || 0,
        currency: payload.currency || 'دينار أردني',
        issue_date: payload.issue_date,
        due_date: payload.due_date,
        received_date: payload.received_date || now.split('T')[0],
        status: payload.status || 'received',
        notes: payload.notes || '',
        image_path: image_path,
        is_deleted: 0,
        deleted_reason: null,
        created_at: now,
        updated_at: now
      };

      const columns = Object.keys(p).join(', ');
      const placeholders = Object.keys(p).map(k => `@${k}`).join(', ');

      database.prepare(`INSERT INTO incoming_checks (${columns}) VALUES (${placeholders})`).run(p);

      db.audit('incoming_check', 'created', id, { check_number: p.check_number, drawer_name: p.drawer_name, amount: p.amount });
      db.enqueueSync('upsert', 'incoming_checks', id, p);

      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('incoming_checks:update', (_e, payload) => {
    try {
      const { id } = payload;
      const existing = database.prepare('SELECT * FROM incoming_checks WHERE id = ?').get(id);
      if (!existing) return { ok: false, error: 'الشيك غير موجود' };

      let image_path = existing.image_path;
      if (payload.imageBase64) {
        image_path = existing.image_path || `${id}.jpg`;
        imageService.saveBase64ImageLocally(payload.imageBase64, image_path);
      } else if (payload.removeImage) {
        image_path = null;
      }

      const now = db.nowISO();
      const p = {
        ...existing,
        check_number: payload.check_number ?? existing.check_number,
        drawer_name: payload.drawer_name ?? existing.drawer_name,
        drawer_phone: payload.drawer_phone ?? existing.drawer_phone,
        bank_name: payload.bank_name ?? existing.bank_name,
        amount: payload.amount !== undefined ? Number(payload.amount) : existing.amount,
        currency: payload.currency ?? existing.currency,
        issue_date: payload.issue_date ?? existing.issue_date,
        due_date: payload.due_date ?? existing.due_date,
        received_date: payload.received_date ?? existing.received_date,
        status: payload.status ?? existing.status,
        notes: payload.notes ?? existing.notes,
        image_path: image_path,
        updated_at: now
      };

      const updates = Object.keys(p).map(k => `${k} = @${k}`).join(', ');
      database.prepare(`UPDATE incoming_checks SET ${updates} WHERE id = @id`).run(p);

      db.audit('incoming_check', 'updated', id, { status: p.status, amount: p.amount });
      db.enqueueSync('upsert', 'incoming_checks', id, p);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('incoming_checks:delete', (_e, payload) => {
    try {
      const { id, reason } = payload;
      const existing = database.prepare('SELECT * FROM incoming_checks WHERE id = ?').get(id);
      if (!existing) return { ok: false, error: 'الشيك غير موجود' };

      const now = db.nowISO();
      database.prepare('UPDATE incoming_checks SET is_deleted=1, deleted_reason=?, updated_at=? WHERE id=?').run(reason || '', now, id);

      db.audit('incoming_check', 'deleted', id, { reason });
      const row = database.prepare('SELECT * FROM incoming_checks WHERE id = ?').get(id);
      db.enqueueSync('upsert', 'incoming_checks', id, row);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
