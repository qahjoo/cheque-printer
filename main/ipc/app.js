// =============================================================================
// main/ipc/app.js — نطاق التطبيق العام (وضع الإقلاع، بيئة التشغيل، الاتصال)
// =============================================================================

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const REQUIRED_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function envStatus() {
  const status = {};
  for (const k of REQUIRED_ENV_KEYS) status[k] = !!process.env[k];
  return { configured: REQUIRED_ENV_KEYS.every((k) => status[k]), keys: status };
}

// Persist Setup Wizard values into a .env file at the project/app root.
function writeEnvFile(values) {
  const envPath = path.join(
    app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..', '..'),
    '.env'
  );
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.trimStart().startsWith('#')) {
      map.set(line.slice(0, idx).trim(), line.slice(idx + 1));
    }
  }
  for (const [k, v] of Object.entries(values || {})) {
    if (v === undefined || v === null) continue;
    map.set(k, String(v));
    process.env[k] = String(v); // apply immediately for this session
  }
  const out = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(envPath, out, 'utf8');
  return envPath;
}

// Connectivity probe: fetch https://1.1.1.1 with a 3-second timeout.
function checkOnline() {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    fetch('https://1.1.1.1', { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
      .then(() => { clearTimeout(timer); resolve(true); })
      .catch(() => { clearTimeout(timer); resolve(false); });
  });
}

module.exports = function registerApp(ipcMain, ctx) {
  ipcMain.handle('app:bootMode', () => (envStatus().configured ? 'ready' : 'setup'));

  ipcMain.handle('app:envStatus', () => envStatus());

  ipcMain.handle('app:saveEnv', (_e, values) => {
    try {
      writeEnvFile(values);
      ctx.db.audit('settings', 'changed', 'env', { keys: Object.keys(values || {}) });
      return { ok: true, ...envStatus() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:online', async () => ({ online: await checkOnline() }));

  ipcMain.handle('app:quit', () => {
    ctx.quit();
    return { ok: true };
  });
};
