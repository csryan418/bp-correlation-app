import { getDb } from '../db/index.js';

// Health Auto Export sends { data: { metrics: [ { name, data: [...] }, ... ] } }
// Each entry's timestamp is in entry.date ("YYYY-MM-DD HH:MM:SS ±ZZZZ")
function entryDate(entry) {
  return (entry.date ?? entry.startDate ?? '').slice(0, 10);
}

function entryHour(entry) {
  const ts = entry.date ?? entry.startDate ?? '';
  const m = ts.match(/[T ](\d{2}):/);
  return m ? parseInt(m[1], 10) : 0;
}

export function receiveAppleHealth(req, res) {
  const payload = req.body;
  const metrics = payload?.data?.metrics;

  console.log('[apple-health] received payload with', Array.isArray(metrics) ? metrics.length : 0, 'metrics');

  if (!Array.isArray(metrics)) {
    return res.status(400).json({ error: 'Expected { data: { metrics: [...] } } payload' });
  }

  // Index metric data arrays by metric name
  const byMetric = {};
  for (const metric of metrics) {
    byMetric[metric.name] = Array.isArray(metric.data) ? metric.data : [];
  }

  console.log('[apple-health] metric names received:', Object.keys(byMetric).join(', '));

  const db = getDb();
  const stored = { blood_pressure: [], resting_heart_rate: [], heart_rate_variability: [], steps: [], active_energy: [] };
  const skipped = { blood_pressure: [], resting_heart_rate: [], heart_rate_variability: [], steps: [], active_energy: [] };

  // --- Blood Pressure ---
  // Each entry has lowercase systolic and diastolic fields already paired on the same record
  const bpEntries = byMetric['blood_pressure'] ?? [];
  let bpMalformed = 0;
  let bpMalformedExample = null;
  for (const entry of bpEntries) {
    if (entry.systolic == null || entry.diastolic == null) {
      bpMalformed++;
      if (bpMalformedExample === null) bpMalformedExample = entry;
      continue;
    }

    const date = entryDate(entry);
    const time_of_day = entryHour(entry) < 12 ? 'morning' : 'evening';

    const existing = db
      .prepare('SELECT id FROM blood_pressure WHERE date = ? AND time_of_day = ? AND source = ?')
      .get(date, time_of_day, 'apple_health');

    if (existing) {
      skipped.blood_pressure.push(date);
      continue;
    }

    db.prepare(
      'INSERT INTO blood_pressure (date, time_of_day, systolic, diastolic, source) VALUES (?, ?, ?, ?, ?)'
    ).run(date, time_of_day, Math.round(entry.systolic), Math.round(entry.diastolic), 'apple_health');

    stored.blood_pressure.push({ date, time_of_day, systolic: entry.systolic, diastolic: entry.diastolic });
  }
  console.log(`[apple-health] blood_pressure: stored ${stored.blood_pressure.length}, skipped ${skipped.blood_pressure.length}, malformed ${bpMalformed}`);
  if (bpMalformed > 0) {
    console.warn(`[apple-health] WARNING: ${bpMalformed} malformed blood_pressure entries, example: ${JSON.stringify(bpMalformedExample)}`);
  }

  // --- Resting Heart Rate ---
  for (const entry of byMetric['resting_heart_rate'] ?? []) {
    const date = entryDate(entry);

    const ouraExists = db.prepare('SELECT id FROM oura_sleep WHERE date = ?').get(date);
    if (ouraExists) {
      skipped.resting_heart_rate.push(date);
      continue;
    }

    try {
      db.prepare('INSERT INTO oura_sleep (date, resting_heart_rate) VALUES (?, ?)').run(
        date,
        Math.round(entry.value)
      );
      stored.resting_heart_rate.push({ date, resting_heart_rate: entry.value });
    } catch {
      skipped.resting_heart_rate.push(date);
    }
  }
  console.log(`[apple-health] resting_heart_rate: stored ${stored.resting_heart_rate.length}, skipped ${skipped.resting_heart_rate.length}`);

  // --- Heart Rate Variability ---
  for (const entry of byMetric['heart_rate_variability'] ?? []) {
    const date = entryDate(entry);

    const ouraExists = db.prepare('SELECT id FROM oura_sleep WHERE date = ?').get(date);
    if (ouraExists) {
      skipped.heart_rate_variability.push(date);
      continue;
    }

    try {
      db.prepare('INSERT INTO oura_sleep (date, hrv_average) VALUES (?, ?)').run(date, entry.value);
      stored.heart_rate_variability.push({ date, hrv_average: entry.value });
    } catch {
      skipped.heart_rate_variability.push(date);
    }
  }
  console.log(`[apple-health] heart_rate_variability: stored ${stored.heart_rate_variability.length}, skipped ${skipped.heart_rate_variability.length}`);

  // --- Step Count ---
  // Each entry uses "qty" for the step value; sum all interval entries per day before storing
  const stepsByDate = {};
  for (const entry of byMetric['step_count'] ?? []) {
    const date = entryDate(entry);
    stepsByDate[date] = (stepsByDate[date] ?? 0) + entry.qty;
  }

  for (const [date, totalSteps] of Object.entries(stepsByDate)) {
    const existing = db.prepare('SELECT id, steps FROM daily_summary WHERE date = ?').get(date);

    if (existing?.steps != null) {
      skipped.steps.push(date);
      continue;
    }

    const rounded = parseInt(totalSteps, 10);
    if (existing) {
      db.prepare('UPDATE daily_summary SET steps = ? WHERE date = ?').run(rounded, date);
    } else {
      db.prepare('INSERT INTO daily_summary (date, steps) VALUES (?, ?)').run(date, rounded);
    }

    stored.steps.push({ date, steps: rounded });
  }
  console.log(`[apple-health] step_count: stored ${stored.steps.length}, skipped ${skipped.steps.length}`);

  // --- Active Energy ---
  // Each entry uses "qty" for kcal; sum all interval entries per day before storing
  const energyByDate = {};
  for (const entry of byMetric['active_energy'] ?? []) {
    const date = entryDate(entry);
    energyByDate[date] = (energyByDate[date] ?? 0) + entry.qty;
  }

  for (const [date, totalKcal] of Object.entries(energyByDate)) {
    const existing = db.prepare('SELECT id, active_energy_kcal FROM daily_summary WHERE date = ?').get(date);

    if (existing?.active_energy_kcal != null) {
      skipped.active_energy.push(date);
      continue;
    }

    const rounded = Math.round(totalKcal);
    if (existing) {
      db.prepare('UPDATE daily_summary SET active_energy_kcal = ? WHERE date = ?').run(rounded, date);
    } else {
      db.prepare('INSERT INTO daily_summary (date, active_energy_kcal) VALUES (?, ?)').run(date, rounded);
    }

    stored.active_energy.push({ date, active_energy_kcal: rounded });
  }
  console.log(`[apple-health] active_energy: stored ${stored.active_energy.length}, skipped ${skipped.active_energy.length}`);

  // Record wall-clock timestamps for /api/health and /api/sync/status
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_apple_health_push', datetime('now'))").run();
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_apple_health_sync', datetime('now'))").run();

  res.json({ success: true, stored, skipped });
}
