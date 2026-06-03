import { getDb } from '../db/index.js';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayCheckin(req, res) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM daily_checkins WHERE date = ?').get(todayStr());
  if (!row) return res.status(404).json({ exists: false });
  res.json({ exists: true, checkin: row });
}

export function saveCheckin(req, res) {
  const db = getDb();
  const { eight_sleep, stress_level, alcohol, energy_level } = req.body;
  const date = todayStr();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO daily_checkins (date, eight_sleep, stress_level, alcohol, energy_level, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      eight_sleep = excluded.eight_sleep,
      stress_level = excluded.stress_level,
      alcohol = excluded.alcohol,
      energy_level = excluded.energy_level
  `).run(date, eight_sleep ?? null, stress_level ?? null, alcohol ?? null, energy_level ?? null, now);

  const row = db.prepare('SELECT * FROM daily_checkins WHERE date = ?').get(date);
  res.json({ checkin: row });
}
