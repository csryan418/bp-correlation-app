ALTER TABLE food_log ADD COLUMN meal_id INTEGER;
ALTER TABLE food_log ADD COLUMN logged_time TEXT;

CREATE TABLE IF NOT EXISTS saved_meals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_meal_items (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_meal_id         INTEGER NOT NULL REFERENCES saved_meals(id) ON DELETE CASCADE,
  food_name             TEXT    NOT NULL,
  fdc_id                TEXT,
  default_serving_size  TEXT,
  sodium_mg_per_100g    REAL,
  potassium_mg_per_100g REAL,
  magnesium_mg_per_100g REAL
);
