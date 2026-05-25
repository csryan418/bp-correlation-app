import { getDb } from '../db/index.js';

export function listSavedMeals(req, res) {
  const db = getDb();
  const meals = db.prepare('SELECT * FROM saved_meals ORDER BY created_at DESC').all();
  const items = db.prepare('SELECT * FROM saved_meal_items WHERE saved_meal_id = ?');
  const result = meals.map(m => ({ ...m, items: items.all(m.id) }));
  res.json(result);
}

export function createSavedMeal(req, res) {
  const { name, items } = req.body;
  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'name and items[] are required' });
  }
  const db = getDb();
  const mealId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO saved_meals (name) VALUES (?)')
      .run(name.trim());
    const insertItem = db.prepare(
      `INSERT INTO saved_meal_items
        (saved_meal_id, food_name, fdc_id, default_serving_size,
         sodium_mg_per_100g, potassium_mg_per_100g, magnesium_mg_per_100g)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insertItem.run(
        lastInsertRowid,
        item.food_name,
        item.fdc_id ?? null,
        item.default_serving_size ?? null,
        item.sodium_mg_per_100g ?? null,
        item.potassium_mg_per_100g ?? null,
        item.magnesium_mg_per_100g ?? null,
      );
    }
    return lastInsertRowid;
  })();

  const meal = db.prepare('SELECT * FROM saved_meals WHERE id = ?').get(mealId);
  const itemRows = db.prepare('SELECT * FROM saved_meal_items WHERE saved_meal_id = ?').all(mealId);
  res.status(201).json({ ...meal, items: itemRows });
}

export function deleteSavedMeal(req, res) {
  const { id } = req.params;
  const result = getDb().prepare('DELETE FROM saved_meals WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
}
