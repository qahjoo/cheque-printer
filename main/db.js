// =============================================================================
// main/db.js — طبقة الوصول إلى قاعدة بيانات SQLite المحلية
// Opens better-sqlite3, runs migrations in /database/migrations, and exposes
// shared helpers used across the IPC domains and services:
//   - db            : the raw better-sqlite3 instance
//   - nowISO()      : consistent UTC ISO timestamp
//   - getSetting/setSetting
//   - audit()       : append a row to the immutable audit_log
//   - enqueueSync() : push a write into sync_queue for the cloud processor
// This module keeps ALL Node/SQLite access in the main process (renderer never
// touches it — it only talks through the contextBridge preload API).
// =============================================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { app } = require('electron');

let db = null;

function nowISO() {
  return new Date().toISOString();
}

// Resolve where the DB file and migrations live. In production we keep the DB in
// Electron's userData dir; migrations ship with the app resources.
function resolvePaths() {
  const userData = app ? app.getPath('userData') : path.join(__dirname, '..', '.data');
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  const dbFile = path.join(userData, 'cheques.sqlite');

  // Migrations directory — dev layout first, then packaged resources.
  const candidates = [
    path.join(__dirname, '..', 'database', 'migrations'),
    path.join(process.resourcesPath || '', 'database', 'migrations'),
  ];
  const migrationsDir = candidates.find((p) => p && fs.existsSync(p)) || candidates[0];
  return { dbFile, migrationsDir };
}

function runMigrations(database, migrationsDir) {
  database.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`);

  const applied = new Set(
    database.prepare('SELECT name FROM _migrations').all().map((r) => r.name)
  );

  if (!fs.existsSync(migrationsDir)) {
    console.warn('[db] migrations directory not found:', migrationsDir);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const insert = database.prepare(
    'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const tx = database.transaction(() => {
      database.exec(sql);
      insert.run(file, nowISO());
    });
    tx();
    console.log('[db] applied migration:', file);
  }
}

function init() {
  if (db) return db;
  const { dbFile, migrationsDir } = resolvePaths();
  db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

// ---- settings helpers -------------------------------------------------------
function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value == null ? '' : String(value), nowISO());
}

// ---- audit log (append-only) -----------------------------------------------
const SENSITIVE_KEYS = /token|password|secret|pin|smtp_pass|anon_key/i;

function maskDetails(entity, details) {
  if (entity !== 'settings' || !details) return details;
  const clone = { ...details };
  for (const k of Object.keys(clone)) {
    if (SENSITIVE_KEYS.test(k)) clone[k] = '***';
  }
  return clone;
}

function audit(entity, action, entityId, details) {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (entity, action, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        entity,
        action,
        entityId == null ? null : String(entityId),
        details == null ? null : JSON.stringify(maskDetails(entity, details)),
        nowISO()
      );
  } catch (err) {
    console.error('[audit] failed:', err.message);
  }
}

// ---- sync queue -------------------------------------------------------------
function enqueueSync(operation, tableName, recordId, payload) {
  getDb()
    .prepare(
      `INSERT INTO sync_queue (operation, table_name, record_id, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      operation,
      tableName,
      String(recordId),
      JSON.stringify(payload || {}),
      nowISO(),
      nowISO()
    );
}

module.exports = {
  init,
  getDb,
  nowISO,
  getSetting,
  getAllSettings,
  setSetting,
  audit,
  enqueueSync,
};
