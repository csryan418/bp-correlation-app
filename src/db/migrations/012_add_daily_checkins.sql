CREATE TABLE IF NOT EXISTS daily_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  eight_sleep INTEGER,
  stress_level INTEGER,
  alcohol INTEGER,
  energy_level INTEGER,
  created_at TEXT NOT NULL
);
