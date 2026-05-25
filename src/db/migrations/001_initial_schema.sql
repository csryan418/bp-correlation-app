-- Blood pressure readings
CREATE TABLE IF NOT EXISTS blood_pressure (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT    NOT NULL,
  time_of_day  TEXT,
  systolic     INTEGER NOT NULL,
  diastolic    INTEGER NOT NULL,
  notes        TEXT
);

-- Food intake log
CREATE TABLE IF NOT EXISTS food_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT    NOT NULL,
  meal_type     TEXT    NOT NULL,
  food_name     TEXT    NOT NULL,
  serving_size  TEXT,
  sodium_mg     REAL,
  potassium_mg  REAL,
  magnesium_mg  REAL,
  calories      REAL
);

-- Daily hydration log
CREATE TABLE IF NOT EXISTS hydration_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date     TEXT NOT NULL,
  water_oz REAL NOT NULL
);

-- Oura sleep and recovery data
CREATE TABLE IF NOT EXISTS oura_sleep (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  date                 TEXT    NOT NULL UNIQUE,
  deep_sleep_minutes   INTEGER,
  total_sleep_minutes  INTEGER,
  hrv_average          REAL,
  resting_heart_rate   INTEGER,
  readiness_score      INTEGER
);

-- Free-form daily notes for correlation journaling
CREATE TABLE IF NOT EXISTS daily_summary (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  date  TEXT NOT NULL UNIQUE,
  notes TEXT
);
