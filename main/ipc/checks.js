// =============================================================================
// main/ipc/checks.js — إدارة الشيكات (إنشاء/تعديل/حالة/حذف ناعم/طباعة/لوحة)
// Every write: update local SQLite -> audit -> enqueue cloud sync.
// SQLite is the local source of truth; Supabase upsert is attempted async.
// =============================================================================

const { randomUUID } = require('crypto');
const supabaseService = require('../services/supabaseService');
const printService = require('../services/printService');

const VALID_STATUS = ['open', 'collected', 'returned', 'cancelled'];

function rowToCheck(row) {
  if (!row) return null;
  return { ...row, is_deleted: !!row.is_deleted };
}

module.exports = function registerChecks(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  // ---- LIST with optional filters ------------------------------------------
  ipcMain.handle('checks:list', (_e, filters = {}) => {
    const clauses = ['c.is_deleted = 0'];
    const params = {};
    if (filters.status && VALID_STATUS.includes(filters.status)) {
      clauses.push('c.status = @status');
      params.status = filters.status;
    }
    if (filters.bank_id) {
      clauses.push('c.bank_id = @bank_id');
      params.bank_id = filters.bank_id;
    }
    if (filters.payee) {
      clauses.push('c.payee_ar LIKE @payee');
      params.payee = `%${filters.payee}%`;
    }
    if (filters.search) {
      clauses.push('(c.payee_ar LIKE @search OR c.check_number LIKE @search)');
      params.search = `%${filters.search}%`;
    }
    if (filters.from) {
      clauses.push('date(c.due_date) >= date(@from)');
      params.from = filters.from;
    }
    if (filters.to) {
      clauses.push('date(c.due_date) <= date(@to)');
      params.to = filters.to;
    }
    const sql = `
      SELECT c.*, b.name_ar AS bank_name_ar, b.name_en AS bank_name_en
      FROM checks c LEFT JOIN banks b ON b.id = c.bank_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY date(c.due_date) ASC, c.created_at ASC`;
    return database.prepare(sql).all(params).map(rowToCheck);
  });

  ipcMain.handle('checks:get', (_e, id) => {
    const row = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id WHERE c.id = ?`
      )
      .get(id);
    return rowToCheck(row);
  });

  // ---- CREATE ---------------------------------------------------------------
  ipcMain.handle('checks:create', async (_e, data) => {
    try {
      const id = data.id || `chk-${randomUUID()}`;
      const now = db.nowISO();
      const rec = {
        id,
        check_number: String(data.check_number || '').trim(),
        bank_id: data.bank_id,
        payee_ar: String(data.payee_ar || '').trim(),
        payee_en: data.payee_en || null,
        amount: Number(data.amount) || 0,
        amount_words_ar: data.amount_words_ar || '',
        currency: data.currency || 'دينار أردني',
        issue_date: data.issue_date,
        due_date: data.due_date,
        status: VALID_STATUS.includes(data.status) ? data.status : 'open',
        collected_by: data.collected_by || null,
        collected_at: data.collected_at || null,
        notes: data.notes || null,
        created_at: now,
        updated_at: now,
      };
      if (!rec.check_number || !rec.payee_ar || !rec.bank_id || !rec.due_date) {
        return { ok: false, error: 'الحقول الأساسية (الرقم، المستفيد، البنك، الاستحقاق) مطلوبة' };
      }

      database
        .prepare(
          `INSERT INTO checks
            (id, check_number, bank_id, payee_ar, payee_en, amount, amount_words_ar,
             currency, issue_date, due_date, status, collected_by, collected_at,
             notes, created_at, updated_at)
           VALUES
            (@id,@check_number,@bank_id,@payee_ar,@payee_en,@amount,@amount_words_ar,
             @currency,@issue_date,@due_date,@status,@collected_by,@collected_at,
             @notes,@created_at,@updated_at)`
        )
        .run(rec);

      db.audit('check', 'created', id, rec);
      db.enqueueSync('upsert', 'checks', id, rec);
      supabaseService.tryUpsert('checks', rec).catch(() => {});

      ctx.refreshTrayTooltip();
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- UPDATE ---------------------------------------------------------------
  ipcMain.handle('checks:update', async (_e, payload) => {
    try {
      const { id, ...changes } = payload || {};
      const before = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);
      if (!before) return { ok: false, error: 'الشيك غير موجود' };

      const allowed = [
        'check_number', 'bank_id', 'payee_ar', 'payee_en', 'amount',
        'amount_words_ar', 'currency', 'issue_date', 'due_date', 'notes',
      ];
      const sets = [];
      const params = { id, updated_at: db.nowISO() };
      const diff = {};
      for (const key of allowed) {
        if (key in changes && changes[key] !== before[key]) {
          sets.push(`${key} = @${key}`);
          params[key] = changes[key];
          diff[key] = { from: before[key], to: changes[key] };
        }
      }
      if (!sets.length) return { ok: true, unchanged: true };
      sets.push('updated_at = @updated_at');

      database.prepare(`UPDATE checks SET ${sets.join(', ')} WHERE id = @id`).run(params);
      const after = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);

      db.audit('check', 'updated', id, diff);
      db.enqueueSync('upsert', 'checks', id, after);
      supabaseService.tryUpsert('checks', after).catch(() => {});

      ctx.refreshTrayTooltip();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- CHANGE STATUS --------------------------------------------------------
  ipcMain.handle('checks:changeStatus', async (_e, payload) => {
    try {
      const { id, status, collected_by } = payload || {};
      if (!VALID_STATUS.includes(status)) return { ok: false, error: 'حالة غير صالحة' };
      const before = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);
      if (!before) return { ok: false, error: 'الشيك غير موجود' };

      const now = db.nowISO();
      const collectedAt = status === 'collected' ? now : null;
      database
        .prepare(
          `UPDATE checks SET status=@status, collected_by=@collected_by,
             collected_at=@collected_at, updated_at=@updated_at WHERE id=@id`
        )
        .run({
          id,
          status,
          collected_by: status === 'collected' ? collected_by || null : null,
          collected_at: collectedAt,
          updated_at: now,
        });

      const after = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);
      db.audit('check', 'status_changed', id, {
        from: before.status,
        to: status,
        collected_by: collected_by || null,
        at: now,
      });
      db.enqueueSync('upsert', 'checks', id, after);
      supabaseService.tryUpsert('checks', after).catch(() => {});

      ctx.refreshTrayTooltip();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- SOFT DELETE ----------------------------------------------------------
  ipcMain.handle('checks:softDelete', async (_e, payload) => {
    try {
      const { id, reason } = payload || {};
      const before = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);
      if (!before) return { ok: false, error: 'الشيك غير موجود' };

      const now = db.nowISO();
      database
        .prepare(
          `UPDATE checks SET is_deleted=1, deleted_reason=@reason, updated_at=@now WHERE id=@id`
        )
        .run({ id, reason: reason || null, now });

      db.audit('check', 'soft_deleted', id, { reason: reason || null });
      const after = database.prepare('SELECT * FROM checks WHERE id = ?').get(id);
      db.enqueueSync('upsert', 'checks', id, after);
      supabaseService.tryUpsert('checks', after).catch(() => {});

      ctx.refreshTrayTooltip();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- DASHBOARD aggregates -------------------------------------------------
  ipcMain.handle('checks:dashboard', () => {
    const days = parseInt(db.getSetting('reminder_days_ahead', '7'), 10) || 7;
    const summary = database
      .prepare(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
         FROM checks WHERE is_deleted = 0 GROUP BY status`
      )
      .all();

    const totals = { open: 0, collected: 0, returned: 0, cancelled: 0 };
    const amounts = { open: 0, collected: 0, returned: 0, cancelled: 0 };
    for (const r of summary) {
      totals[r.status] = r.count;
      amounts[r.status] = r.total;
    }

    const dueSoon = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id
         WHERE c.is_deleted = 0 AND c.status = 'open'
           AND date(c.due_date) BETWEEN date('now') AND date('now', ?)
         ORDER BY date(c.due_date) ASC`
      )
      .all(`+${days} days`)
      .map(rowToCheck);

    const overdue = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
         LEFT JOIN banks b ON b.id = c.bank_id
         WHERE c.is_deleted = 0 AND c.status = 'open' AND date(c.due_date) < date('now')
         ORDER BY date(c.due_date) ASC`
      )
      .all()
      .map(rowToCheck);

    return { totals, amounts, dueSoon, overdue, reminderDays: days };
  });

  // ---- PRINT ----------------------------------------------------------------
  ipcMain.handle('checks:print', async (_e, id) => {
    const check = database
      .prepare(
        `SELECT c.*, b.name_ar AS bank_name_ar, b.print_template, b.check_width_mm, b.check_height_mm
         FROM checks c LEFT JOIN banks b ON b.id = c.bank_id WHERE c.id = ?`
      )
      .get(id);
    if (!check) return { ok: false, error: 'الشيك غير موجود' };
    try {
      const result = await printService.printCheck(check, db.getAllSettings());
      return result;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('checks:markPrinted', (_e, id) => {
    const now = db.nowISO();
    database.prepare('UPDATE checks SET printed_at=?, updated_at=? WHERE id=?').run(now, now, id);
    db.audit('check', 'printed', id, { at: now });
    return { ok: true };
  });
};
