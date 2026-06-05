import { getDb } from '../db/index.js';

export function syncWorkouts(req, res) {
  const workouts = req.body;

  if (!Array.isArray(workouts)) {
    return res.status(400).json({ error: 'Expected an array of workout objects' });
  }

  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO workouts
      (hk_uuid, workout_type, start_time, end_time, duration_minutes, calories, distance_meters, avg_heart_rate)
    VALUES
      (@hk_uuid, @workout_type, @start_time, @end_time, @duration_minutes, @calories, @distance_meters, @avg_heart_rate)
  `);

  let inserted = 0;
  const syncMany = db.transaction((items) => {
    for (const w of items) {
      const result = insert.run({
        hk_uuid: w.hk_uuid,
        workout_type: w.workout_type,
        start_time: w.start_time,
        end_time: w.end_time,
        duration_minutes: w.duration_minutes,
        calories: w.calories,
        distance_meters: w.distance_meters ?? null,
        avg_heart_rate: w.avg_heart_rate ?? null,
      });
      if (result.changes > 0) inserted++;
    }
  });

  syncMany(workouts);

  const received = workouts.length;
  const skipped = received - inserted;
  res.json({ received, inserted, skipped });
}

export function getWorkouts(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM workouts ORDER BY start_time DESC').all();
  res.json(rows);
}

export function getWorkoutYesterday(req, res) {
  const db = getDb();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
  const row = db
    .prepare(`
      SELECT
        workout_type,
        SUM(duration_minutes) AS total_duration_minutes,
        SUM(calories)         AS total_calories,
        COUNT(*)              AS workout_count
      FROM workouts
      WHERE date(start_time) = ?
      GROUP BY workout_type
      ORDER BY total_calories DESC
      LIMIT 1
    `)
    .get(yesterday);
  res.json(row ?? null);
}
