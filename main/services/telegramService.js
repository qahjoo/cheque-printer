// =============================================================================
// main/services/telegramService.js — إرسال الرسائل عبر Telegram Bot API
// Uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from .env (secrets never in SQLite).
// Pure fetch (Node 18+ global fetch) — no extra dependency. All errors are
// returned as { ok, error } so the reminder log can record them.
// =============================================================================

function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function sendMessage(text) {
  if (!isConfigured()) {
    return { ok: false, error: 'Telegram غير مهيأ (التوكن أو معرف المحادثة مفقود)' };
  }
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.result && data.result.message_id };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'انتهت مهلة الاتصال بتيليغرام' : err.message };
  }
}

// Verify the bot token is valid (used from Settings test).
async function verify() {
  if (!isConfigured()) return { ok: false, error: 'غير مهيأ' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await res.json().catch(() => ({}));
    return data.ok ? { ok: true, bot: data.result.username } : { ok: false, error: data.description };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { isConfigured, sendMessage, verify };
