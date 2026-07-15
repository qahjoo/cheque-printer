// =============================================================================
// main/ipc/sync.js — حالة المزامنة السحابية + تشغيلها يدوياً
// =============================================================================

const supabaseService = require('../services/supabaseService');

module.exports = function registerSync(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  ipcMain.handle('sync:status', async () => {
    const pending = database
      .prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'`)
      .get().n;
    const failed = database
      .prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'failed'`)
      .get().n;
    return {
      configured: supabaseService.isConfigured(),
      online: await supabaseService.isOnline(),
      pending,
      failed,
      lastSyncAt: db.getSetting('last_sync_at', ''),
    };
  });

  ipcMain.handle('sync:now', async () => {
    try {
      const result = await supabaseService.drainQueue(ctx);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Reset all failed items back to pending, then drain immediately.
  ipcMain.handle('sync:retryFailed', async () => {
    try {
      const n = database.prepare("UPDATE sync_queue SET status='pending', attempts=0, last_error=NULL WHERE status='failed'").run().changes;
      db.audit('sync', 'retry_failed', null, { reset: n });
      const result = await supabaseService.drainQueue(ctx);
      return { ok: true, reset: n, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
