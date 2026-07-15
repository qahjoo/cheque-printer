// =============================================================================
// main/services/reminderService.js — خدمة التذكيرات (cron + كل القنوات)
// Finds open checks due within reminder_days_ahead and notifies via the enabled
// channels (desktop / telegram / email). Sends ONE grouped message listing all
// matching checks (never one message per check). Fires reminders_per_day times
// between reminder_start_hour and reminder_end_hour. Every attempt -> reminder_log.
// =============================================================================

const cron = require('node-cron');
const { Notification } = require('electron');
const telegramService = require('./telegramService');
const emailService = require('./emailService');

let dbLayer = null;
let ctxRef = null;
const scheduled = [];

function fmtAmount(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Collect open checks due within the configured window.
function findDueChecks() {
  const days = parseInt(dbLayer.getSetting('reminder_days_ahead', '7'), 10) || 7;
  return dbLayer
    .getDb()
    .prepare(
      `SELECT c.*, b.name_ar AS bank_name_ar FROM checks c
       LEFT JOIN banks b ON b.id = c.bank_id
       WHERE c.is_deleted = 0 AND c.status = 'open'
         AND date(c.due_date) BETWEEN date('now') AND date('now', ?)
       ORDER BY date(c.due_date) ASC`
    )
    .all(`+${days} days`);
}

function logAttempt(checkId, channel, success, message, error) {
  dbLayer
    .getDb()
    .prepare(
      `INSERT INTO reminder_log (check_id, channel, success, message, error, created_at)
       VALUES (?,?,?,?,?,?)`
    )
    .run(checkId, channel, success ? 1 : 0, message || null, error || null, dbLayer.nowISO());
  dbLayer.audit('reminder', 'sent', checkId, { channel, success, error: error || null });
}

function buildTextSummary(checks, days) {
  const lines = checks.map(
    (c) =>
      `• ${c.payee_ar} — ${fmtAmount(c.amount)} ${c.currency} — استحقاق ${c.due_date}` +
      (c.bank_name_ar ? ` (${c.bank_name_ar})` : '')
  );
  return (
    `🔔 لديك ${checks.length} شيك مستحق خلال ${days} أيام:\n\n` +
    lines.join('\n') +
    `\n\nنظام الشيكات — شهد وهبة للتمور`
  );
}

// The core notification pass — returns { checks_found, notifications_sent }.
async function runNow() {
  const days = parseInt(dbLayer.getSetting('reminder_days_ahead', '7'), 10) || 7;
  const checks = findDueChecks();
  const sent = [];

  if (checks.length === 0) {
    return { ok: true, checks_found: 0, notifications_sent: [] };
  }

  const summaryText = buildTextSummary(checks, days);
  const checkIds = checks.map((c) => c.id).join(',');

  // ---- Desktop notification (ONE grouped) ----------------------------------
  if (dbLayer.getSetting('channel_desktop', '1') === '1') {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({
          title: `تذكير: ${checks.length} شيكات مستحقة`,
          body: checks
            .slice(0, 5)
            .map((c) => `${c.payee_ar} — ${fmtAmount(c.amount)} ${c.currency}`)
            .join('\n'),
        });
        n.on('click', () => ctxRef && ctxRef.showMainWindow && ctxRef.showMainWindow('/dashboard'));
        n.show();
      }
      logAttempt(checkIds, 'desktop', true, `${checks.length} checks`);
      sent.push({ channel: 'desktop', ok: true });
    } catch (err) {
      logAttempt(checkIds, 'desktop', false, null, err.message);
      sent.push({ channel: 'desktop', ok: false, error: err.message });
    }
  }

  // ---- Telegram (ONE grouped message) --------------------------------------
  if (dbLayer.getSetting('channel_telegram', '1') === '1') {
    const res = await telegramService.sendMessage(summaryText);
    logAttempt(checkIds, 'telegram', res.ok, `${checks.length} checks`, res.error);
    sent.push({ channel: 'telegram', ok: res.ok, error: res.error });
  }

  // ---- Email (optional) -----------------------------------------------------
  if (dbLayer.getSetting('channel_email', '0') === '1') {
    const res = await emailService.sendReminder(checks, days, dbLayer.getAllSettings());
    logAttempt(checkIds, 'email', res.ok, `${checks.length} checks`, res.error);
    sent.push({ channel: 'email', ok: res.ok, error: res.error });
  }

  return { ok: true, checks_found: checks.length, notifications_sent: sent };
}

// Build cron expressions spreading reminders_per_day between start/end hours.
function buildCronTimes() {
  const perDay = Math.min(Math.max(parseInt(dbLayer.getSetting('reminders_per_day', '5'), 10) || 5, 1), 12);
  const start = (dbLayer.getSetting('reminder_start_hour', '08:00') || '08:00').split(':');
  const end = (dbLayer.getSetting('reminder_end_hour', '20:00') || '20:00').split(':');
  const startH = parseInt(start[0], 10) || 8;
  const endH = parseInt(end[0], 10) || 20;
  const span = Math.max(endH - startH, 1);
  const step = span / Math.max(perDay - 1, 1);

  const times = [];
  for (let i = 0; i < perDay; i += 1) {
    const hour = Math.round(startH + step * i);
    times.push(Math.min(hour, endH));
  }
  return Array.from(new Set(times));
}

function start(ctx) {
  ctxRef = ctx;
  dbLayer = ctx.db;
  reschedule();
}

// (Re)build the cron schedule from current settings.
function reschedule() {
  for (const t of scheduled) t.stop();
  scheduled.length = 0;
  const hours = buildCronTimes();
  for (const h of hours) {
    const expr = `0 ${h} * * *`; // at minute 0 of hour h, daily
    if (!cron.validate(expr)) continue;
    scheduled.push(
      cron.schedule(expr, () => {
        runNow().catch((err) => console.error('[reminder] run failed:', err.message));
      })
    );
  }
  console.log('[reminder] scheduled at hours:', hours.join(', '));
}

module.exports = { start, runNow, reschedule };
