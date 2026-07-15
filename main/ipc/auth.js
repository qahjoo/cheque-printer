// =============================================================================
// main/ipc/auth.js — قفل PIN (bcrypt hash مخزَّن في settings.pin_hash)
// 5 wrong attempts -> lock for 5 minutes + audit entry. Lock state is kept in
// memory (resets on app restart, which is acceptable for a local single-user app).
// =============================================================================

const bcrypt = require('bcryptjs');

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

let failedAttempts = 0;
let lockedUntil = 0;

function isLocked() {
  return Date.now() < lockedUntil;
}

module.exports = function registerAuth(ipcMain, ctx) {
  const { db } = ctx;

  ipcMain.handle('auth:hasPin', () => {
    const h = db.getSetting('pin_hash', '');
    return { hasPin: !!h };
  });

  ipcMain.handle('auth:lockState', () => ({
    locked: isLocked(),
    lockedUntil,
    remainingMs: Math.max(0, lockedUntil - Date.now()),
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - failedAttempts),
  }));

  ipcMain.handle('auth:setPin', (_e, pin) => {
    if (!pin || String(pin).length < 4) {
      return { ok: false, error: 'الرقم السري يجب أن يكون 4 أرقام على الأقل' };
    }
    const hash = bcrypt.hashSync(String(pin), 10);
    db.setSetting('pin_hash', hash);
    db.audit('settings', 'changed', 'pin_hash', { key: 'pin_hash' });
    return { ok: true };
  });

  ipcMain.handle('auth:changePin', (_e, payload) => {
    const { currentPin, newPin } = payload || {};
    const hash = db.getSetting('pin_hash', '');
    if (hash && !bcrypt.compareSync(String(currentPin || ''), hash)) {
      return { ok: false, error: 'الرقم السري الحالي غير صحيح' };
    }
    if (!newPin || String(newPin).length < 4) {
      return { ok: false, error: 'الرقم السري الجديد يجب أن يكون 4 أرقام على الأقل' };
    }
    db.setSetting('pin_hash', bcrypt.hashSync(String(newPin), 10));
    db.audit('settings', 'changed', 'pin_hash', { key: 'pin_hash' });
    return { ok: true };
  });

  ipcMain.handle('auth:verifyPin', (_e, pin) => {
    if (isLocked()) {
      return {
        ok: false,
        locked: true,
        remainingMs: lockedUntil - Date.now(),
        error: 'التطبيق مقفل مؤقتاً. حاول لاحقاً.',
      };
    }
    const hash = db.getSetting('pin_hash', '');
    if (!hash) return { ok: true, noPin: true }; // no PIN set -> allow through

    if (bcrypt.compareSync(String(pin || ''), hash)) {
      failedAttempts = 0;
      return { ok: true };
    }

    failedAttempts += 1;
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = Date.now() + LOCK_MS;
      failedAttempts = 0;
      db.audit('settings', 'changed', 'pin_lock', {
        event: 'locked_after_failed_attempts',
        minutes: 5,
      });
      return {
        ok: false,
        locked: true,
        remainingMs: LOCK_MS,
        error: 'تم قفل التطبيق لمدة 5 دقائق بسبب المحاولات الخاطئة.',
      };
    }
    return {
      ok: false,
      attemptsLeft: MAX_ATTEMPTS - failedAttempts,
      error: 'الرقم السري غير صحيح',
    };
  });
};
