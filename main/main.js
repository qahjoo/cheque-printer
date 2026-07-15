// =============================================================================
// main/main.js — نقطة دخول تطبيق Electron
// Launch sequence (Module 9):
//   1. Load .env (dotenv)
//   2. Check required keys -> Setup Wizard route if missing
//   3. Run SQLite migrations
//   4. PIN lock screen (renderer decides based on pin_hash)
//   5. Main window
//   6. Reminder cron jobs
//   7. Sync queue processor
//   8. System tray
// The window minimizes to tray on close; real quit only from the tray menu.
// =============================================================================

const path = require('path');
const fs = require('fs');

// ---- Load .env from the correct location in both dev and packaged builds ----
// Search order: 1) userData dir (user-editable after install)
//               2) resources dir (shipped with installer)
//               3) project root (dev)
function loadEnv() {
  const candidates = [
    // In packaged app, allow user to put a .env in userData
    path.join(
      require('electron').app
        ? require('electron').app.getPath('userData')
        : '',
      '.env'
    ),
    // Bundled inside the installer via extraResources
    path.join(process.resourcesPath || '', '.env'),
    // Dev: project root
    path.join(__dirname, '..', '.env'),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        console.log('[env] loaded from:', p);
        return;
      }
    } catch { /* ignore */ }
  }
  console.warn('[env] no .env file found — Supabase/Telegram will be disabled');
}
loadEnv();

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
} = require('electron');

const dbLayer = require('./db');
const registerIpc = require('./ipc');
const reminderService = require('./services/reminderService');
const supabaseService = require('./services/supabaseService');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Required .env keys — if any are missing the renderer opens the Setup Wizard.
const REQUIRED_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function envIsConfigured() {
  return REQUIRED_ENV_KEYS.every((k) => !!process.env[k]);
}

function trayIconImage() {
  // Ship a small check/cheque PNG; fall back to an empty image if absent.
  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

function dueSoonCount() {
  try {
    const days = parseInt(dbLayer.getSetting('reminder_days_ahead', '7'), 10) || 7;
    const row = dbLayer
      .getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM checks
         WHERE is_deleted = 0 AND status = 'open'
           AND date(due_date) BETWEEN date('now') AND date('now', ?)`
      )
      .get(`+${days} days`);
    return row ? row.n : 0;
  } catch {
    return 0;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    title: 'شيكات — شهد وهبة للتمور',
    backgroundColor: '#1e1b2e',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Tell the renderer whether setup is needed (Setup Wizard vs PIN/Dashboard).
  const bootstrap = envIsConfigured() ? 'ready' : 'setup';
  const query = `?boot=${bootstrap}`;

  if (isDev) {
    mainWindow.loadURL(DEV_URL + '/' + query);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      search: query.slice(1),
    });
  }

  // Open external links in the OS browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close -> minimize to tray unless the user chose "quit" from the tray menu.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow(route) {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (route) mainWindow.webContents.send('navigate', route);
}

function refreshTrayTooltip() {
  if (!tray) return;
  tray.setToolTip('شيكات شهد وهبة');
}

function createTray() {
  tray = new Tray(trayIconImage());
  const menu = Menu.buildFromTemplate([
    { label: 'فتح التطبيق', click: () => showMainWindow('/dashboard') },
    {
      label: 'تذكيرات الآن',
      click: async () => {
        const result = await reminderService.runNow();
        showMainWindow('/reminders');
        if (mainWindow) mainWindow.webContents.send('reminders:result', result);
      },
    },
    { type: 'separator' },
    {
      label: 'إغلاق التطبيق',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showMainWindow());
  refreshTrayTooltip();
  setInterval(refreshTrayTooltip, 60 * 1000);
}

// -----------------------------------------------------------------------------
// App lifecycle
// -----------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    // 3. migrations
    dbLayer.init();

    // Register all IPC domains with a shared context.
    const ctx = {
      db: dbLayer,
      getMainWindow: () => mainWindow,
      showMainWindow,
      refreshTrayTooltip,
      quit: () => {
        isQuitting = true;
        app.quit();
      },
    };
    registerIpc(ipcMain, ctx);

    // 5. main window
    createMainWindow();

    // 8. tray
    createTray();

    // 6 & 7. background services (guarded — never crash the app on failure)
    try {
      reminderService.start(ctx);
    } catch (err) {
      console.error('[reminderService] start failed:', err.message);
    }
    try {
      supabaseService.startQueueProcessor(ctx);
    } catch (err) {
      console.error('[supabaseService] start failed:', err.message);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else showMainWindow();
    });
  });

  // Do NOT quit on all-windows-closed (we live in the tray). Quit only via tray.
  app.on('window-all-closed', () => {
    // no-op on all platforms — tray keeps the app alive
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });
}
