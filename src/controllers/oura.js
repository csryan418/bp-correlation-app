import { getDb } from '../db/index.js';
import { fetchSleepSessions, fetchReadiness, fetchDailyActivity } from '../services/oura.js';

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: toISO(start), endDate: toISO(end) };
}

// When multiple sessions exist for a day, use the longest (main sleep vs naps).
function pickPrimarySession(sessions) {
  const byDay = new Map();
  for (const s of sessions) {
    const existing = byDay.get(s.day);
    const duration = s.total_sleep_duration ?? 0;
    if (!existing || duration > (existing.total_sleep_duration ?? 0)) {
      byDay.set(s.day, s);
    }
  }
  return byDay;
}

// Core sync logic — returns result data or throws. Used by both the HTTP route and the cron job.
export async function runOuraSync() {
  if (!process.env.OURA_API_KEY) throw new Error('OURA_API_KEY is not configured');

  const { startDate, endDate } = dateRange(7);

  const [sleepSessions, readinessList, activityList] = await Promise.all([
    fetchSleepSessions(startDate, endDate),
    fetchReadiness(startDate, endDate),
    fetchDailyActivity(startDate, endDate),
  ]);

  const primaryByDay = pickPrimarySession(sleepSessions);
  const readinessByDay = new Map(readinessList.map(r => [r.day, r.score]));
  const activityByDay = new Map(activityList.map(a => [a.day, a]));

  const db = getDb();

  // --- Sleep ---
  // COALESCE ensures a re-sync fills in nulls without overwriting already-good values.
  // This handles the case where Oura inserts a row early (readiness only) before sleep
  // processing is done, then a later sync can fill in deep_sleep_minutes, hrv_average, etc.
  const upsertSleep = db.prepare(`
    INSERT INTO oura_sleep (date, deep_sleep_minutes, total_sleep_minutes, hrv_average, resting_heart_rate, readiness_score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      deep_sleep_minutes  = COALESCE(excluded.deep_sleep_minutes,  deep_sleep_minutes),
      total_sleep_minutes = COALESCE(excluded.total_sleep_minutes, total_sleep_minutes),
      hrv_average         = COALESCE(excluded.hrv_average,         hrv_average),
      resting_heart_rate  = COALESCE(excluded.resting_heart_rate,  resting_heart_rate),
      readiness_score     = COALESCE(excluded.readiness_score,     readiness_score)
  `);

  const sleepSynced = [];

  for (const day of [...new Set([...primaryByDay.keys(), ...readinessByDay.keys()])].sort()) {
    const session = primaryByDay.get(day);
    const readinessScore = readinessByDay.get(day) ?? null;

    const deepSleepMinutes = session?.deep_sleep_duration != null
      ? Math.round(session.deep_sleep_duration / 60)
      : null;
    const totalSleepMinutes = session?.total_sleep_duration != null
      ? Math.round(session.total_sleep_duration / 60)
      : null;
    const hrvAverage = session?.average_hrv ?? null;
    const restingHeartRate = session?.lowest_heart_rate ?? null;

    upsertSleep.run(day, deepSleepMinutes, totalSleepMinutes, hrvAverage, restingHeartRate, readinessScore);
    sleepSynced.push(day);
  }

  // --- Activity ---
  const upsertActivity = db.prepare(`
    INSERT INTO oura_activity (date, active_calories, total_calories, steps, equivalent_walking_distance, activity_score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      active_calories             = COALESCE(excluded.active_calories,             active_calories),
      total_calories              = COALESCE(excluded.total_calories,              total_calories),
      steps                       = COALESCE(excluded.steps,                       steps),
      equivalent_walking_distance = COALESCE(excluded.equivalent_walking_distance, equivalent_walking_distance),
      activity_score              = COALESCE(excluded.activity_score,              activity_score)
  `);

  const activitySynced = [];

  for (const day of [...activityByDay.keys()].sort()) {
    const a = activityByDay.get(day);
    upsertActivity.run(
      day,
      a.active_calories ?? null,
      a.total_calories   ?? null,
      a.steps            ?? null,
      a.equivalent_walking_distance ?? null,
      a.score            ?? null
    );
    activitySynced.push(day);
  }

  return {
    range: { start: startDate, end: endDate },
    sleep:    { synced: sleepSynced.length,    syncedDates: sleepSynced },
    activity: { synced: activitySynced.length, syncedDates: activitySynced },
  };
}

export function getTodaySleep(req, res) {
  const db = getDb()
  const d = new Date()
  const localDate = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
  // Return today's row, or the most recent one if today hasn't synced yet
  const row = db
    .prepare('SELECT * FROM oura_sleep WHERE date <= ? ORDER BY date DESC LIMIT 1')
    .get(localDate)
  res.json(row ?? null)
}

export function getYesterdaySleep(req, res) {
  const db = getDb()
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
  const row = db
    .prepare('SELECT * FROM oura_sleep WHERE date <= ? ORDER BY date DESC LIMIT 1')
    .get(yesterday)
  res.json(row ?? null)
}

export function getYesterdayActivity(req, res) {
  const db = getDb()
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
  const row = db
    .prepare('SELECT * FROM oura_activity WHERE date = ?')
    .get(yesterday)
  res.json(row ?? null)
}

export async function manualSync(req, res) {
  try {
    const result = await runOuraSync();
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
}

export async function syncOura(req, res) {
  try {
    const result = await runOuraSync();
    res.json(result);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) return res.status(502).json({ error: 'Oura API key is invalid or expired' });
    if (status === 429) return res.status(502).json({ error: 'Oura API rate limit exceeded' });
    if (err.message === 'OURA_API_KEY is not configured') return res.status(503).json({ error: err.message });
    res.status(502).json({ error: `Oura API request failed: ${err.message}` });
  }
}
