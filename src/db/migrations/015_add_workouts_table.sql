CREATE TABLE IF NOT EXISTS workouts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  hk_uuid          TEXT    NOT NULL UNIQUE,
  workout_type     TEXT    NOT NULL,
  start_time       TEXT    NOT NULL,
  end_time         TEXT    NOT NULL,
  duration_minutes REAL    NOT NULL,
  calories         REAL    NOT NULL,
  distance_meters  REAL,
  avg_heart_rate   REAL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
