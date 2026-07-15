-- =============================================================================
-- 002_templates.sql — نماذج القوالب المتعددة + سجل الطباعة
-- Multi-template model (Template + TemplateField) + print history.
-- Coordinates stored in MILLIMETERS. x_mm = distance from the RIGHT edge
-- (RTL origin), y_mm = distance from the TOP edge. Rendering converts mm->px.
-- Keeps existing `banks`/`checks` tables untouched.
-- =============================================================================

-- ---- templates -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  width_mm         REAL    NOT NULL DEFAULT 165,
  height_mm        REAL    NOT NULL DEFAULT 82,
  background_image TEXT,                       -- base64 data URL of cheque scan (optional)
  is_default       INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- ---- template_fields -------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_fields (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  field_name  TEXT    NOT NULL,                -- payee | amount_words | amount_number | date | purpose | cheque_number | crossed
  x_mm        REAL    NOT NULL DEFAULT 20,     -- from RIGHT edge (RTL)
  y_mm        REAL    NOT NULL DEFAULT 20,     -- from TOP edge
  font_family TEXT    NOT NULL DEFAULT 'Cairo',
  font_size   REAL    NOT NULL DEFAULT 12,
  font_weight TEXT    NOT NULL DEFAULT '400',
  color       TEXT    NOT NULL DEFAULT '#000000',
  align       TEXT    NOT NULL DEFAULT 'right',
  direction   TEXT    NOT NULL DEFAULT 'rtl',
  visible     INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_tfields_template ON template_fields(template_id);

-- ---- print_history ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS print_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  print_date    TEXT    NOT NULL,             -- ISO datetime of print
  cheque_date   TEXT,                          -- date printed on the cheque
  payee         TEXT    NOT NULL,
  amount        REAL    NOT NULL DEFAULT 0,
  amount_words  TEXT,
  purpose       TEXT,
  cheque_number TEXT,
  currency      TEXT    NOT NULL DEFAULT 'دينار أردني',
  crossed       INTEGER NOT NULL DEFAULT 0 CHECK (crossed IN (0,1)),
  template_id   INTEGER,
  template_name TEXT,
  printed_by    TEXT    NOT NULL DEFAULT 'المستخدم',
  status        TEXT    NOT NULL DEFAULT 'printed',  -- printed | reprinted | cancelled
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_date  ON print_history(print_date);
CREATE INDEX IF NOT EXISTS idx_history_payee ON print_history(payee);

-- ---- seed one default template + its fields --------------------------------
INSERT INTO templates (name, width_mm, height_mm, is_default, created_at, updated_at)
SELECT 'القالب الافتراضي', 165, 82, 1,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM templates);

INSERT INTO template_fields (template_id, field_name, x_mm, y_mm, font_family, font_size, font_weight, color, align, direction, visible)
SELECT t.id, f.field_name, f.x_mm, f.y_mm, f.font_family, f.font_size, '400', '#000000', f.align, f.direction, 1
FROM (SELECT id FROM templates ORDER BY id LIMIT 1) t
JOIN (
  SELECT 'payee'         AS field_name, 20.0 AS x_mm, 32.0 AS y_mm, 'Cairo' AS font_family, 12.0 AS font_size, 'right' AS align, 'rtl' AS direction
  UNION ALL SELECT 'amount_words',  60.0, 39.0, 'Cairo', 11.0, 'right', 'rtl'
  UNION ALL SELECT 'amount_number', 50.0, 45.0, 'Arial', 13.0, 'left',  'ltr'
  UNION ALL SELECT 'date',          125.0,18.0, 'Arial', 12.0, 'left',  'ltr'
  UNION ALL SELECT 'purpose',       20.0, 55.0, 'Cairo', 11.0, 'right', 'rtl'
  UNION ALL SELECT 'cheque_number', 20.0, 15.0, 'Arial', 12.0, 'left',  'ltr'
  UNION ALL SELECT 'crossed',       140.0,10.0, 'Arial', 12.0, 'left',  'ltr'
) f
WHERE NOT EXISTS (SELECT 1 FROM template_fields);
