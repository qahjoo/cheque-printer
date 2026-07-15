-- =============================================================================
-- 004_incoming_checks.sql — جدول الشيكات الواردة
-- =============================================================================

CREATE TABLE IF NOT EXISTS incoming_checks (
  id              TEXT    PRIMARY KEY,
  check_number    TEXT    NOT NULL,
  drawer_name     TEXT    NOT NULL,  -- الساحب / العميل
  drawer_phone    TEXT,              -- رقم الهاتف (اختياري)
  bank_name       TEXT    NOT NULL,  -- البنك المسحوب عليه
  amount          REAL    NOT NULL CHECK (amount >= 0),
  currency        TEXT    NOT NULL DEFAULT 'دينار أردني',
  issue_date      TEXT    NOT NULL,  -- yyyy-mm-dd
  due_date        TEXT    NOT NULL,  -- yyyy-mm-dd
  received_date   TEXT    NOT NULL,  -- yyyy-mm-dd
  status          TEXT    NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'under_collection', 'collected', 'returned', 'endorsed')),
  notes           TEXT,
  is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  deleted_reason  TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_incoming_due_date   ON incoming_checks(due_date);
CREATE INDEX IF NOT EXISTS idx_incoming_status     ON incoming_checks(status);
CREATE INDEX IF NOT EXISTS idx_incoming_drawer     ON incoming_checks(drawer_name);
CREATE INDEX IF NOT EXISTS idx_incoming_is_deleted ON incoming_checks(is_deleted);

-- Keep updated_at fresh automatically
CREATE TRIGGER IF NOT EXISTS trg_incoming_checks_touch
  AFTER UPDATE ON incoming_checks
  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE incoming_checks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;
