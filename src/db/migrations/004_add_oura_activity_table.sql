-- Oura Ring daily activity data
CREATE TABLE IF NOT EXISTS oura_activity (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  date                       TEXT    NOT NULL UNIQUE,
  active_calories            INTEGER,
  total_calories             INTEGER,
  steps                      INTEGER,
  equivalent_walking_distance INTEGER,
  activity_score             INTEGER
);
