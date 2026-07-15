// =============================================================================
// main/ipc/index.js — يسجّل جميع نطاقات الـ IPC
// Each domain module exports register(ipcMain, ctx). ctx carries the db layer
// and window helpers (see main.js). Keeping one file per domain matches the
// deliverables and keeps handlers small and testable.
// =============================================================================

const registerApp = require('./app');
const registerAuth = require('./auth');
const registerChecks = require('./checks');
const registerBanks = require('./banks');
const registerSettings = require('./settings');
const registerReports = require('./reports');
const registerReminders = require('./reminders');
const registerAudit = require('./audit');
const registerSync = require('./sync');
const registerPrint = require('./print');
const registerTemplates = require('./templates');
const registerHistory = require('./history');
const registerBackup = require('./backup');
const registerIncomingChecks = require('./incomingChecks');
const registerUpdater = require('./updater');

module.exports = function registerIpc(ipcMain, ctx) {
  registerApp(ipcMain, ctx);
  registerAuth(ipcMain, ctx);
  registerChecks(ipcMain, ctx);
  registerBanks(ipcMain, ctx);
  registerSettings(ipcMain, ctx);
  registerReports(ipcMain, ctx);
  registerReminders(ipcMain, ctx);
  registerAudit(ipcMain, ctx);
  registerSync(ipcMain, ctx);
  registerPrint(ipcMain, ctx);
  registerTemplates(ipcMain, ctx);
  registerHistory(ipcMain, ctx);
  registerBackup(ipcMain, ctx);
  registerIncomingChecks(ipcMain, ctx);
  registerUpdater(ipcMain, ctx);
};
