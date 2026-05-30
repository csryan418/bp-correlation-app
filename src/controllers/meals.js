import { getDb } from '../db/index.js';

export function listMeals(req, res) {
  const db = getDb();
  const meals = db.prepare('SELECT * FROM meal_templates ORDER BY created_at DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM meal_template_items WHERE meal_template_id = ?');
  const result = meals.map(m => ({ ...m, items: itemsStmt.all(m.id) }));
  res.json(result);
}

export function createMeal(req, res) {
  const { name, items } = req.body;
  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'name and items[] are required' });
  }
  const db = getDb();
  const now = new Date().toISOString();
  const mealId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO meal_templates (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name.trim(), now, now);
    const insertItem = db.prepare(
      `INSERT INTO meal_template_items
        (meal_template_id, food_name, fdc_id, serving_size, serving_unit, calories, sodium, potassium, magnesium)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insertItem.run(
        lastInsertRowid,
        item.food_name,
        item.fdc_id ?? null,
        item.serving_size ?? null,
        item.serving_unit ?? null,
        item.calories ?? null,
        item.sodium ?? null,
        item.potassium ?? null,
        item.magnesium ?? null,
      );
    }
    return lastInsertRowid;
  })();

  const meal = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(mealId);
  const itemRows = db.prepare('SELECT * FROM meal_template_items WHERE meal_template_id = ?').all(mealId);
  res.status(201).json({ ...meal, items: itemRows });
}

export function renameMeal(req, res) {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const now = new Date().toISOString();
  const result = getDb()
    .prepare('UPDATE meal_templates SET name = ?, updated_at = ? WHERE id = ?')
    .run(name.trim(), now, id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}

export function deleteMeal(req, res) {
  const { id } = req.params;
  const result = getDb().prepare('DELETE FROM meal_templates WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}

export function loadMeal(req, res) {
  const { id } = req.params;
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(id);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM meal_template_items WHERE meal_template_id = ?').all(id);
  res.json({ meal, items });
}

export function updateMealItem(req, res) {
  const { id, itemId } = req.params;
  const { food_name, fdc_id, serving_size, serving_unit, calories, sodium, potassium, magnesium } = req.body;
  const db = getDb();
  const item = db.prepare('SELECT * FROM meal_template_items WHERE id = ? AND meal_template_id = ?').get(itemId, id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE meal_template_items
    SET food_name = ?, fdc_id = ?, serving_size = ?, serving_unit = ?, calories = ?, sodium = ?, potassium = ?, magnesium = ?
    WHERE id = ?
  `).run(
    food_name ?? item.food_name,
    fdc_id !== undefined ? fdc_id : item.fdc_id,
    serving_size !== undefined ? serving_size : item.serving_size,
    serving_unit !== undefined ? serving_unit : item.serving_unit,
    calories ?? null,
    sodium !== undefined ? sodium : item.sodium,
    potassium !== undefined ? potassium : item.potassium,
    magnesium !== undefined ? magnesium : item.magnesium,
    itemId
  );
  db.prepare('UPDATE meal_templates SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  res.json({ ok: true });
}

export function addMealItem(req, res) {
  const { id } = req.params;
  const { food_name, fdc_id, serving_size, serving_unit, calories, sodium, potassium, magnesium } = req.body;
  if (!food_name) return res.status(400).json({ error: 'food_name is required' });
  const db = getDb();
  const meal = db.prepare('SELECT id FROM meal_templates WHERE id = ?').get(id);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO meal_template_items
      (meal_template_id, food_name, fdc_id, serving_size, serving_unit, calories, sodium, potassium, magnesium)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, food_name, fdc_id ?? null, serving_size ?? null, serving_unit ?? null, calories ?? null, sodium ?? null, potassium ?? null, magnesium ?? null);
  db.prepare('UPDATE meal_templates SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  res.status(201).json(db.prepare('SELECT * FROM meal_template_items WHERE id = ?').get(lastInsertRowid));
}

export function deleteMealItem(req, res) {
  const { id, itemId } = req.params;
  const result = getDb().prepare('DELETE FROM meal_template_items WHERE id = ? AND meal_template_id = ?').run(itemId, id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}
