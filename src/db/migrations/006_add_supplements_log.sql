CREATE TABLE IF NOT EXISTS supplements_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  supplement_name TEXT NOT NULL,
  dosage       REAL NOT NULL,
  dosage_unit  TEXT NOT NULL CHECK (dosage_unit IN ('mg', 'IU', 'mcg', 'g')),
  time_of_day  TEXT NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplements_log_date ON supplements_log (date);
CREATE INDEX IF NOT EXISTS idx_supplements_log_name ON supplements_log (supplement_name);
