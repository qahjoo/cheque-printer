// =============================================================================
// main/ipc/history.js — سجل الشيكات المطبوعة (Print History)
// add (logged after a print) / list (search + date filter) / get (for reprint).
// Every write: audit_log + sync_queue + best-effort Supabase upsert.
// =============================================================================

const supabaseService = require('../services/supabaseService');

module.exports = function registerHistory(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  ipcMain.handle('history:add', (_e, data = {}) => {
    try {
      const now = db.nowISO();
      const rec = {
        print_date:    now,
        cheque_date:   data.cheque_date   || null,
        payee:         data.payee         || '',
        amount:        Number(data.amount) || 0,
        amount_words:  data.amount_words  || '',
        purpose:       data.purpose       || null,
        cheque_number: data.cheque_number || null,
        currency:      data.currency      || 'دينار أردني',
        crossed:       data.crossed ? 1 : 0,
        template_id:   data.template_id   || null,
        template_name: data.template_name || null,
        printed_by:    data.printed_by    || 'المستخدم',
        status:        data.status        || 'printed',
        created_at:    now,
      };

      const info = database
        .prepare(
          `INSERT INTO print_history
            (print_date, cheque_date, payee, amount, amount_words, purpose, cheque_number,
             currency, crossed, template_id, template_name, printed_by, status, created_at)
           VALUES
            (@print_date,@cheque_date,@payee,@amount,@amount_words,@purpose,@cheque_number,
             @currency,@crossed,@template_id,@template_name,@printed_by,@status,@created_at)`
        )
        .run(rec);

      const id = info.lastInsertRowid;

      // Audit every print action
      db.audit('print_history', 'printed', id, {
        payee:         rec.payee,
        amount:        rec.amount,
        cheque_number: rec.cheque_number,
        template_name: rec.template_name,
      });

      // Queue for cloud sync
      const syncRec = { ...rec, id, crossed: !!rec.crossed };
      db.enqueueSync('upsert', 'print_history', id, syncRec);
      supabaseService.tryUpsert('print_history', syncRec).catch(() => {});

      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('history:list', (_e, filters = {}) => {
    const where = [];
    const params = {};
    if (filters.search) {
      where.push('(payee LIKE @s OR cheque_number LIKE @s OR purpose LIKE @s)');
      params.s = `%${filters.search}%`;
    }
    if (filters.from)   { where.push('date(print_date) >= date(@from)'); params.from = filters.from; }
    if (filters.to)     { where.push('date(print_date) <= date(@to)');   params.to   = filters.to;   }
    if (filters.status) { where.push('status = @status');                params.status = filters.status; }
    const sql = `SELECT * FROM print_history ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY id DESC LIMIT 500`;
    return database.prepare(sql).all(params).map((r) => ({ ...r, crossed: !!r.crossed }));
  });

  ipcMain.handle('history:get', (_e, id) => {
    const r = database.prepare('SELECT * FROM print_history WHERE id = ?').get(id);
    return r ? { ...r, crossed: !!r.crossed } : null;
  });
};
