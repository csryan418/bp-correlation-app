CREATE TABLE IF NOT EXISTS meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  serving_size REAL,
  serving_unit TEXT,
  calories REAL,
  sodium REAL,
  potassium REAL,
  magnesium REAL
);
