import { getDb } from '../db/index.js';

export function list(req, res) {
  const rows = getDb()
    .prepare(`
      SELECT * FROM blood_pressure
      WHERE date >= date('now', '-30 days')
      ORDER BY date DESC, id DESC
    `)
    .all();
  res.json(rows);
}

export function create(req, res) {
  const { date, time_of_day, systolic, diastolic, notes } = req.body;
  if (!date || systolic == null || diastolic == null) {
    return res.status(400).json({ error: 'date, systolic, and diastolic are required' });
  }
  const result = getDb()
    .prepare(
      'INSERT INTO blood_pressure (date, time_of_day, systolic, diastolic, notes) VALUES (?, ?, ?, ?, ?)'
    )
    .run(date, time_of_day ?? null, systolic, diastolic, notes ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
}
