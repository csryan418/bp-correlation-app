import { getDb } from '../db/index.js';
import { lookupNutrients, searchFoods, getFoodPortions, getOpenFoodFactsPortions } from '../services/usda.js';

export async function search(req, res) {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const results = await searchFoods(name.trim());
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: 'USDA search failed', detail: err.message });
  }
}

export async function getPortions(req, res) {
  const { fdcId } = req.params;
  try {
    const fetcher = fdcId.startsWith('off_') ? getOpenFoodFactsPortions : getFoodPortions;
    const { portions, basePer100g, isBeverage } = await fetcher(fdcId);
    res.json({ fdcId, portions, basePer100g, isBeverage });
  } catch (err) {
    res.status(502).json({ error: 'Portions fetch failed', detail: err.message });
  }
}

export function logFood(req, res) {
  const { fdcId, description, servings, sodium_mg, potassium_mg, magnesium_mg, portion_grams, portion_label, date, meal_type, meal_id } = req.body;
  if (!description || !date) {
    return res.status(400).json({ error: 'description and date are required' });
  }
  const qty = parseFloat(servings) || 1;
  const loggedTime = new Date().toISOString();
  // sodium_mg / potassium_mg / magnesium_mg are pre-multiplied totals from the frontend
  const result = getDb()
    .prepare(
      `INSERT INTO food_log
        (date, meal_type, meal_id, logged_time, food_name, serving_size, fdc_id, sodium_mg, potassium_mg, magnesium_mg, portion_grams, portion_label, calories)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      date,
      meal_type ?? 'unspecified',
      meal_id   ?? null,
      loggedTime,
      description,
      String(qty),
      fdcId ?? null,
      sodium_mg    ?? null,
      potassium_mg ?? null,
      magnesium_mg ?? null,
      portion_grams ?? null,
      portion_label ?? null,
    );

  const row = getDb()
    .prepare('SELECT *, food_name AS description FROM food_log WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(row);
}

export function updateFoodLog(req, res) {
  const { id } = req.params;
  const { servings, sodium_mg, potassium_mg, magnesium_mg } = req.body;
  const qty = servings != null ? parseFloat(servings) : null;

  const result = getDb()
    .prepare(
      `UPDATE food_log
       SET serving_size = ?, sodium_mg = ?, potassium_mg = ?, magnesium_mg = ?
       WHERE id = ?`
    )
    .run(
      qty != null ? String(qty) : null,
      sodium_mg    ?? null,
      potassium_mg ?? null,
      magnesium_mg ?? null,
      id,
    );

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }

  const row = getDb()
    .prepare('SELECT *, food_name AS description FROM food_log WHERE id = ?')
    .get(id);
  res.json(row);
}

export function deleteFood(req, res) {
  const { id } = req.params;
  const result = getDb()
    .prepare('DELETE FROM food_log WHERE id = ?')
    .run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.status(204).end();
}

export function listLog(req, res) {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  }
  const rows = getDb()
    .prepare('SELECT *, food_name AS description FROM food_log WHERE date = ? ORDER BY id ASC')
    .all(date);
  res.json(rows);
}

export function list(req, res) {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  }
  const rows = getDb()
    .prepare('SELECT * FROM food_log WHERE date = ? ORDER BY id ASC')
    .all(date);
  res.json(rows);
}

export function copyMeal(req, res) {
  const { source_date, meal_type, target_date, target_meal_type } = req.body;
  if (!source_date || !meal_type || !target_date) {
    return res.status(400).json({ error: 'source_date, meal_type, and target_date are required' });
  }
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM food_log WHERE date = ? AND LOWER(meal_type) = LOWER(?)')
    .all(source_date, meal_type);

  if (rows.length === 0) return res.json([]);

  const destMealType = target_meal_type || meal_type;
  const loggedTime = new Date().toISOString();
  const newMealId = Date.now();
  const insertStmt = db.prepare(
    `INSERT INTO food_log
      (date, meal_type, meal_id, logged_time, food_name, serving_size, fdc_id, sodium_mg, potassium_mg, magnesium_mg, portion_grams, portion_label, calories)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const created = db.transaction(() =>
    rows.map(r => {
      const result = insertStmt.run(
        target_date, destMealType, newMealId, loggedTime,
        r.food_name, r.serving_size, r.fdc_id,
        r.sodium_mg, r.potassium_mg, r.magnesium_mg,
        r.portion_grams, r.portion_label, r.calories
      );
      return db
        .prepare('SELECT *, food_name AS description FROM food_log WHERE id = ?')
        .get(result.lastInsertRowid);
    })
  )();

  res.status(201).json(created);
}

export async function create(req, res) {
  const { date, meal_type, food_name, serving_size } = req.body;
  if (!date || !meal_type || !food_name) {
    return res.status(400).json({ error: 'date, meal_type, and food_name are required' });
  }

  try {
    const lookup = await lookupNutrients(food_name);
    const { calories, sodium_mg, potassium_mg, magnesium_mg } = lookup?.nutrients ?? {};

    const result = getDb()
      .prepare(
        `INSERT INTO food_log
          (date, meal_type, food_name, serving_size, sodium_mg, potassium_mg, magnesium_mg, calories)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        date, meal_type, food_name, serving_size ?? null,
        sodium_mg ?? null, potassium_mg ?? null, magnesium_mg ?? null, calories ?? null
      );

    res.status(201).json({
      id: result.lastInsertRowid,
      usda_match: lookup ? { fdcId: lookup.fdcId, description: lookup.description } : null,
    });
  } catch (err) {
    res.status(502).json({ error: 'USDA lookup failed', detail: err.message });
  }
}
