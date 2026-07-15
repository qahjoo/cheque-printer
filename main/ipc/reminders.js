// =============================================================================
// main/ipc/reminders.js — تشغيل التذكيرات يدوياً + قراءة سجل التذكيرات
// =============================================================================

const { Notification } = require('electron');
const reminderService = require('../services/reminderService');
const telegramService = require('../services/telegramService');

module.exports = function registerReminders(ipcMain, ctx) {
  const { db } = ctx;
  const database = db.getDb();

  // Manual trigger — runs the full notification check immediately (all channels).
  ipcMain.handle('reminders:test', async () => {
    try {
      return await reminderService.runNow();
    } catch (err) {
      return { ok: false, error: err.message, checks_found: 0, notifications_sent: [] };
    }
  });

  // Test ONLY the desktop notification channel (no DB check needed).
  ipcMain.handle('reminders:testDesktop', () => {
    try {
      if (!Notification.isSupported()) {
        return { ok: false, error: 'إشعارات سطح المكتب غير مدعومة في هذا النظام' };
      }
      const n = new Notification({
        title: '🔔 اختبار الإشعارات — نظام الشيكات',
        body: 'إشعارات سطح المكتب تعمل بشكل صحيح ✓',
      });
      n.show();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Test ONLY the Telegram channel by sending a real test message.
  ipcMain.handle('reminders:testTelegram', async () => {
    try {
      // First verify the bot token is valid
      const verify = await telegramService.verify();
      if (!verify.ok) return { ok: false, error: `توكن البوت غير صالح: ${verify.error}` };
      // Then send a test message
      const res = await telegramService.sendMessage(
        `🔔 <b>اختبار تيليغرام — نظام الشيكات</b>\n\nتيليغرام يعمل بشكل صحيح ✓\nالبوت: @${verify.bot}`
      );
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Last N rows of reminder_log (default 100).
  ipcMain.handle('reminders:log', (_e, limit = 100) => {
    const n = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    return database
      .prepare(
        `SELECT r.*, c.payee_ar, c.check_number FROM reminder_log r
         LEFT JOIN checks c ON c.id = r.check_id
         ORDER BY r.id DESC LIMIT ?`
      )
      .all(n)
      .map((r) => ({ ...r, success: !!r.success }));
  });
};
