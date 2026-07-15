// =============================================================================
// preload.js — جسر السياق الآمن بين العملية الرئيسية وواجهة المستخدم
// Exposes a typed, whitelisted API on window.api. The renderer NEVER touches
// Node or SQLite directly — every capability goes through ipcRenderer.invoke.
// Channel naming mirrors the IPC domain files in /main/ipc.
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

// Subscribe helper that returns an unsubscribe function (for React effects).
function on(channel, handler) {
  const listener = (_event, ...args) => handler(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  // ---- app / shell ----------------------------------------------------------
  app: {
    getBootMode: () => invoke('app:bootMode'),
    getEnvStatus: () => invoke('app:envStatus'),
    saveEnv: (values) => invoke('app:saveEnv', values),
    quit: () => invoke('app:quit'),
    onNavigate: (handler) => on('navigate', handler),
    onlineStatus: () => invoke('app:online'),
  },

  // ---- auth / PIN -----------------------------------------------------------
  auth: {
    hasPin: () => invoke('auth:hasPin'),
    setPin: (pin) => invoke('auth:setPin', pin),
    changePin: (payload) => invoke('auth:changePin', payload),
    verifyPin: (pin) => invoke('auth:verifyPin', pin),
    lockState: () => invoke('auth:lockState'),
  },

  // ---- checks (Outgoing) ----------------------------------------------------
  checks: {
    list: (filters) => invoke('checks:list', filters),
    get: (id) => invoke('checks:get', id),
    create: (data) => invoke('checks:create', data),
    update: (payload) => invoke('checks:update', payload),
    changeStatus: (payload) => invoke('checks:changeStatus', payload),
    softDelete: (payload) => invoke('checks:softDelete', payload),
    dashboard: () => invoke('checks:dashboard'),
    print: (id) => invoke('checks:print', id),
    markPrinted: (id) => invoke('checks:markPrinted', id),
  },

  // ---- incoming checks ------------------------------------------------------
  incomingChecks: {
    list: (filters) => invoke('incoming_checks:list', filters),
    get: (id) => invoke('incoming_checks:get', id),
    create: (payload) => invoke('incoming_checks:create', payload),
    update: (payload) => invoke('incoming_checks:update', payload),
    delete: (payload) => invoke('incoming_checks:delete', payload),
  },

  // ---- updater --------------------------------------------------------------
  updater: {
    check: () => invoke('updater:check'),
    onMessage: (callback) => ipcRenderer.on('updater:message', (_e, data) => callback(data)),
  },

  // ---- banks ----------------------------------------------------------------
  banks: {
    list: () => invoke('banks:list'),
    create: (data) => invoke('banks:create', data),
    update: (payload) => invoke('banks:update', payload),
    remove: (id) => invoke('banks:delete', id),
    saveTemplate: (payload) => invoke('banks:saveTemplate', payload),
  },

  // ---- settings -------------------------------------------------------------
  settings: {
    getAll: () => invoke('settings:getAll'),
    set: (payload) => invoke('settings:set', payload),
    setMany: (obj) => invoke('settings:setMany', obj),
    getPrintTemplate: () => invoke('settings:getPrintTemplate'),
  },

  // ---- print ----------------------------------------------------------------
  print: {
    check: (checkId) => invoke('print:check', checkId),
    report: (payload) => invoke('print:report', payload),
    getPrinters: () => invoke('print:getPrinters'),
  },

  // ---- templates ------------------------------------------------------------
  templates: {
    list: () => invoke('templates:list'),
    get: (id) => invoke('templates:get', id),
    getDefault: () => invoke('templates:getDefault'),
    create: (data) => invoke('templates:create', data),
    update: (payload) => invoke('templates:update', payload),
    rename: (payload) => invoke('templates:rename', payload),
    saveFields: (payload) => invoke('templates:saveFields', payload),
    duplicate: (id) => invoke('templates:duplicate', id),
    remove: (id) => invoke('templates:delete', id),
    setDefault: (id) => invoke('templates:setDefault', id),
  },

  // ---- print history --------------------------------------------------------
  history: {
    add: (data) => invoke('history:add', data),
    list: (filters) => invoke('history:list', filters),
    get: (id) => invoke('history:get', id),
  },

  // ---- reports --------------------------------------------------------------
  reports: {
    dueThisWeek: () => invoke('reports:dueThisWeek'),
    byPayee: (payee) => invoke('reports:byPayee', payee),
    byPeriod: (payload) => invoke('reports:byPeriod', payload),
    statusSummary: () => invoke('reports:statusSummary'),
    payees: () => invoke('reports:payees'),
    exportPdf: (payload) => invoke('reports:exportPdf', payload),
    exportExcel: (payload) => invoke('reports:exportExcel', payload),
    print: (payload) => invoke('reports:print', payload),
  },

  // ---- reminders ------------------------------------------------------------
  reminders: {
    test: () => invoke('reminders:test'),
    testDesktop: () => invoke('reminders:testDesktop'),
    testTelegram: () => invoke('reminders:testTelegram'),
    log: (limit) => invoke('reminders:log', limit),
    onResult: (handler) => on('reminders:result', handler),
  },

  // ---- audit ----------------------------------------------------------------
  audit: {
    list: (payload) => invoke('audit:list', payload),
    exportCsv: () => invoke('audit:exportCsv'),
  },

  // ---- sync -----------------------------------------------------------------
  sync: {
    status: () => invoke('sync:status'),
    now: () => invoke('sync:now'),
    retryFailed: () => invoke('sync:retryFailed'),
  },

  // ---- backup ---------------------------------------------------------------
  backup: {
    export: () => invoke('backup:export'),
    import: () => invoke('backup:import'),
  },
};

contextBridge.exposeInMainWorld('api', api);
