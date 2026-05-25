import { getDb } from '../db/index.js';

export function getHealth(req, res) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const lastOuraSleepDate    = db.prepare('SELECT MAX(date) AS d FROM oura_sleep').get()?.d ?? null;
  const lastOuraActivityDate = db.prepare('SELECT MAX(date) AS d FROM oura_activity').get()?.d ?? null;
  const lastOuraSync = [lastOuraSleepDate, lastOuraActivityDate]
    .filter(Boolean).sort().at(-1) ?? null;

  const bpLast7Days = db.prepare(
    "SELECT COUNT(*) AS n FROM blood_pressure WHERE date >= date('now', '-7 days')"
  ).get().n;

  const lastAppleHealthPush = db.prepare(
    "SELECT value FROM metadata WHERE key = 'last_apple_health_push'"
  ).get()?.value ?? null;

  const todayBP = db.prepare(
    'SELECT COUNT(*) AS n FROM blood_pressure WHERE date = ?'
  ).get(today).n > 0;

  const todayOuraSleep    = db.prepare('SELECT id FROM oura_sleep    WHERE date = ?').get(today) != null;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const todayOuraActivity = db.prepare('SELECT id FROM oura_activity WHERE date = ?').get(yesterdayStr) != null;

  const todayAppleHealth = db.prepare(
    'SELECT id FROM daily_summary WHERE date = ? AND (steps IS NOT NULL OR active_energy_kcal IS NOT NULL)'
  ).get(today) != null;

  res.json({
    lastOuraSync,
    bpReadingsLast7Days: bpLast7Days,
    lastAppleHealthPush,
    todayData: {
      bloodPressure:  todayBP,
      ouraSleep:      todayOuraSleep,
      ouraActivity:   todayOuraActivity,
      appleHealth:    todayAppleHealth,
    },
  });
}
