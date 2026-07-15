-- =============================================================================
-- 001_init.sql — المخطط الكامل لقاعدة بيانات نظام الشيكات
-- شهد وهبة للتمور — ميلانو للتمور
-- SQLite (better-sqlite3). All timestamps stored as ISO-8601 TEXT (UTC).
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- -----------------------------------------------------------------------------
-- banks — البنوك وقوالب الطباعة الخاصة بكل بنك
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS banks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar         TEXT    NOT NULL,
  name_en         TEXT,
  check_width_mm  REAL    NOT NULL DEFAULT 175.0,
  check_height_mm REAL    NOT NULL DEFAULT 80.0,
  -- print_template: JSON describing each printable field's position/style
  -- { "payee": {x,y,fontSize,enabled,align}, "amount_numeric": {...}, ... }
  print_template  TEXT    NOT NULL DEFAULT '{}',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- -----------------------------------------------------------------------------
-- checks — الشيكات (المصدر المحلي للحقيقة)
-- amount stored as REAL in main currency units (دينار.فلس => 1250.500)
-- status ∈ (open | collected | returned | cancelled)
-- id is a client-generated UUID (TEXT) so it can be shared with Supabase.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checks (
  id              TEXT    PRIMARY KEY,
  check_number    TEXT    NOT NULL,
  bank_id         INTEGER NOT NULL REFERENCES banks(id) ON DELETE RESTRICT,
  payee_ar        TEXT    NOT NULL,
  payee_en        TEXT,
  amount          REAL    NOT NULL CHECK (amount >= 0),
  amount_words_ar TEXT    NOT NULL DEFAULT '',
  currency        TEXT    NOT NULL DEFAULT 'دينار أردني',
  issue_date      TEXT    NOT NULL,          -- yyyy-mm-dd
  due_date        TEXT    NOT NULL,          -- yyyy-mm-dd
  status          TEXT    NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','collected','returned','cancelled')),
  collected_by    TEXT,
  collected_at    TEXT,
  notes           TEXT,
  google_event_id TEXT,
  printed_at      TEXT,
  is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  deleted_reason  TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_checks_due_date   ON checks(due_date);
CREATE INDEX IF NOT EXISTS idx_checks_status     ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_payee      ON checks(payee_ar);
CREATE INDEX IF NOT EXISTS idx_checks_bank       ON checks(bank_id);
CREATE INDEX IF NOT EXISTS idx_checks_is_deleted ON checks(is_deleted);

-- -----------------------------------------------------------------------------
-- settings — الإعدادات (non-secret only; secrets live in .env)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- sync_queue — طابور المزامنة السحابية (يُفرَّغ عند توفر الاتصال)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  operation   TEXT    NOT NULL CHECK (operation IN ('upsert','delete')),
  table_name  TEXT    NOT NULL,
  record_id   TEXT    NOT NULL,
  payload     TEXT    NOT NULL DEFAULT '{}',
  attempts    INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','failed')),
  last_error  TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- -----------------------------------------------------------------------------
-- reminder_log — سجل التذكيرات (كل محاولة إشعار)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id   TEXT,
  channel    TEXT    NOT NULL,   -- desktop | telegram | email
  success    INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0,1)),
  message    TEXT,
  error      TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_created ON reminder_log(created_at);

-- -----------------------------------------------------------------------------
-- audit_log — سجل المراجعة (غير قابل للتعديل أو الحذف)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,      -- check | bank | settings | reminder | sync | backup
  action     TEXT NOT NULL,      -- created | updated | status_changed | printed | ...
  entity_id  TEXT,
  details    TEXT,               -- JSON snapshot / diff
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity);

-- Immutability: the audit log may only be appended to.
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
  BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit log is immutable'); END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
  BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit log is immutable'); END;

-- -----------------------------------------------------------------------------
-- Keep updated_at fresh automatically on checks / banks updates.
-- (Application also sets it, but this is a safety net.)
-- -----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_checks_touch
  AFTER UPDATE ON checks
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE checks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

-- -----------------------------------------------------------------------------
-- Seed the SINGLE bank (Jordan). Name is editable in Settings. Dimensions and
-- field positions (right/top in mm, RTL origin) are pre-set per spec.
-- -----------------------------------------------------------------------------
INSERT INTO banks (name_ar, name_en, check_width_mm, check_height_mm, print_template, created_at, updated_at)
SELECT
  'البنك الأردني', 'Jordan Bank', 165.0, 82.0,
  '{"payee_ar":{"right_mm":20,"top_mm":32,"font_size":12,"font_family":"Cairo","direction":"rtl","text_align":"right","enabled":true},'
  || '"amount_ar_words":{"right_mm":60,"top_mm":39,"font_size":11,"font_family":"Cairo","direction":"rtl","text_align":"right","enabled":true},'
  || '"amount":{"right_mm":50,"top_mm":45,"font_size":13,"font_family":"Arial","direction":"ltr","text_align":"left","enabled":true}}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM banks);

-- -----------------------------------------------------------------------------
-- Seed default (non-secret) settings.
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('company_name',        'شهد وهبة للتمور',   strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('company_name_line2',  'ميلانو للتمور',      strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('company_logo',        '',                   strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('currency_singular',   'دينار أردني',        strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('currency_plural',     'دنانير أردنية',      strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('currency_cents_sing', 'فلس',                strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('currency_cents_plur', 'فلوس',               strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('date_format',         'dd/mm/yyyy',         strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('app_language',        'ar',                 strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('reminder_days_ahead', '7',                  strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('reminders_per_day',   '5',                  strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('reminder_start_hour', '08:00',              strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('reminder_end_hour',   '20:00',              strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('channel_desktop',     '1',                  strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('channel_telegram',    '1',                  strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('channel_email',       '0',                  strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('last_sync_at',        '',                   strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('last_backup_at',      '',                   strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('pin_hash',            '',                   strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('schema_version',      '1',                  strftime('%Y-%m-%dT%H:%M:%fZ','now'));
