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

export function update(req, res) {
  const { id } = req.params;
  const { water_oz } = req.body;
  if (water_oz == null) {
    return res.status(400).json({ error: 'water_oz is required' });
  }
  const result = getDb()
    .prepare('UPDATE hydration_log SET water_oz = ? WHERE id = ?')
    .run(water_oz, id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}

export function remove(req, res) {
  const { id } = req.params;
  const result = getDb()
    .prepare('DELETE FROM hydration_log WHERE id = ?')
    .run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
}

export function replaceTotal(req, res) {
  const { date, water_oz } = req.body;
  if (!date || water_oz == null) {
    return res.status(400).json({ error: 'date and water_oz are required' });
  }
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM hydration_log WHERE date = ?').run(date);
    if (water_oz > 0) {
      db.prepare('INSERT INTO hydration_log (date, water_oz) VALUES (?, ?)').run(date, water_oz);
    }
  })();
  res.json({ ok: true });
}
