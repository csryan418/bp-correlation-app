import { getDb } from '../db/index.js';

export function list(req, res) {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  }
  const rows = getDb()
    .prepare('SELECT * FROM hydration_log WHERE date = ? ORDER BY id ASC')
    .all(date);
  res.json(rows);
}

export function create(req, res) {
  const { date, water_oz } = req.body;
  if (!date || water_oz == null) {
    return res.status(400).json({ error: 'date and water_oz are required' });
  }
  const result = getDb()
    .prepare('INSERT INTO hydration_log (date, water_oz) VALUES (?, ?)')
    .run(date, water_oz);
  res.status(201).json({ id: result.lastInsertRowid });
}
