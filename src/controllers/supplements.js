import { getDb } from '../db/index.js';

const today = () => new Date().toISOString().slice(0, 10);

export function listActive(req, res) {
  const rows = getDb()
    .prepare('SELECT * FROM supplements WHERE active = 1 ORDER BY time_of_day, name ASC')
    .all();
  res.json(rows);
}

export function createSupplement(req, res) {
  const { name, dose, unit = 'mg', time_of_day = 'morning' } = req.body;
  if (!name?.trim() || !dose?.trim()) {
    return res.status(400).json({ error: 'name and dose are required' });
  }
  const db = getDb();
  const now = today();
  const id = db.transaction(() => {
    const sup = db
      .prepare('INSERT INTO supplements (name, dose, unit, time_of_day) VALUES (?, ?, ?, ?)')
      .run(name.trim(), dose.trim(), unit, time_of_day);
    db
      .prepare('INSERT INTO supplement_dose_history (supplement_id, dose, unit, effective_from) VALUES (?, ?, ?, ?)')
      .run(sup.lastInsertRowid, dose.trim(), unit, now);
    return sup.lastInsertRowid;
  })();
  res.status(201).json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
}

export function updateSupplement(req, res) {
  const { id } = req.params;
  const { name, dose, unit, time_of_day } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM supplements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newDose = dose ?? existing.dose;
  const newUnit = unit ?? existing.unit;
  const doseChanged = (dose != null && dose !== existing.dose) || (unit != null && unit !== existing.unit);
  const now = today();

  db.transaction(() => {
    db.prepare('UPDATE supplements SET name = ?, dose = ?, unit = ?, time_of_day = ? WHERE id = ?')
      .run(name ?? existing.name, newDose, newUnit, time_of_day ?? existing.time_of_day, id);
    if (doseChanged) {
      db.prepare('UPDATE supplement_dose_history SET effective_to = ? WHERE supplement_id = ? AND effective_to IS NULL')
        .run(now, id);
      db.prepare('INSERT INTO supplement_dose_history (supplement_id, dose, unit, effective_from) VALUES (?, ?, ?, ?)')
        .run(id, newDose, newUnit, now);
    }
  })();

  res.json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
}

export function deleteSupplement(req, res) {
  getDb().prepare('UPDATE supplements SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
}

export function getLog(req, res) {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

  const db = getDb();
  const supplements = db.prepare('SELECT * FROM supplements WHERE active = 1 ORDER BY time_of_day, name ASC').all();
  const logs = db.prepare('SELECT * FROM supplement_logs WHERE date = ?').all(date);
  const logMap = {};
  for (const l of logs) logMap[l.supplement_id] = l;

  res.json(supplements.map(s => ({
    ...s,
    taken: logMap[s.id]?.taken ?? 0,
    log_id: logMap[s.id]?.id ?? null,
  })));
}

export function logDose(req, res) {
  const { supplement_id, date, time_of_day, taken } = req.body;
  if (!supplement_id || !date) {
    return res.status(400).json({ error: 'supplement_id and date are required' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM supplement_logs WHERE supplement_id = ? AND date = ?').get(supplement_id, date);
  if (existing) {
    db.prepare("UPDATE supplement_logs SET taken = ?, logged_at = datetime('now') WHERE id = ?").run(taken ? 1 : 0, existing.id);
    res.json({ id: existing.id });
  } else {
    const result = db.prepare('INSERT INTO supplement_logs (supplement_id, date, time_of_day, taken) VALUES (?, ?, ?, ?)').run(supplement_id, date, time_of_day ?? 'morning', taken ? 1 : 0);
    res.status(201).json({ id: result.lastInsertRowid });
  }
}
