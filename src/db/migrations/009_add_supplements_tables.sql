CREATE TABLE IF NOT EXISTS supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dose TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'mg',
  time_of_day TEXT NOT NULL DEFAULT 'morning',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplement_dose_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplement_id INTEGER NOT NULL REFERENCES supplements(id),
  dose TEXT NOT NULL,
  unit TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplement_id INTEGER NOT NULL REFERENCES supplements(id),
  date TEXT NOT NULL,
  time_of_day TEXT NOT NULL,
  taken INTEGER NOT NULL DEFAULT 0,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplement_logs_date ON supplement_logs (date);
CREATE INDEX IF NOT EXISTS idx_supplement_logs_sup ON supplement_logs (supplement_id);
