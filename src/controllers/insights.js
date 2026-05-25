import { getDb } from '../db/index.js';

// Pearson r — returns null when fewer than 3 paired observations exist
// or when either variable has zero variance.
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom === 0) return null;
  return num / denom;
}

// Build paired arrays by aligning on date, discarding days missing either value.
function pairByDate(aMap, bMap) {
  const xs = [], ys = [];
  for (const [date, x] of aMap) {
    const y = bMap.get(date);
    if (y != null) { xs.push(x); ys.push(y); }
  }
  return { xs, ys };
}

function interpret(r, predictor, direction) {
  if (r === null) return `Not enough overlapping data to calculate a correlation with ${predictor}.`;

  const abs = Math.abs(r);

  let strength;
  if (abs >= 0.6)      strength = 'strongly';
  else if (abs >= 0.3) strength = 'moderately';
  else if (abs >= 0.1) strength = 'weakly';
  else                 return `No meaningful association found between ${predictor} and diastolic BP.`;

  // Always describe the factor in its positive direction; the sign of r tells us
  // whether more of it goes with higher or lower BP.
  return `${direction.positive} is ${strength} associated with ${r >= 0 ? 'higher' : 'lower'} diastolic BP.`;
}

export function getCorrelations(req, res) {
  const db = getDb();

  // --- Blood pressure: average diastolic per day ---
  const bpRows = db.prepare(`
    SELECT date, AVG(diastolic) AS avg_diastolic
    FROM blood_pressure
    WHERE date >= date('now', '-30 days')
    GROUP BY date
  `).all();
  const bpMap = new Map(bpRows.map(r => [r.date, r.avg_diastolic]));

  if (bpMap.size < 3) {
    return res.json({
      message: 'Not enough blood pressure readings (need at least 3 days) to calculate correlations.',
      correlations: [],
    });
  }

  // --- Sodium: total per day ---
  const sodiumRows = db.prepare(`
    SELECT date, SUM(sodium_mg) AS total_sodium
    FROM food_log
    WHERE date >= date('now', '-30 days') AND sodium_mg IS NOT NULL
    GROUP BY date
  `).all();
  const sodiumMap = new Map(sodiumRows.map(r => [r.date, r.total_sodium]));

  // --- Hydration: total oz per day ---
  const hydrationRows = db.prepare(`
    SELECT date, SUM(water_oz) AS total_oz
    FROM hydration_log
    WHERE date >= date('now', '-30 days')
    GROUP BY date
  `).all();
  const hydrationMap = new Map(hydrationRows.map(r => [r.date, r.total_oz]));

  // --- Oura: deep sleep and HRV ---
  const ouraRows = db.prepare(`
    SELECT date, deep_sleep_minutes, hrv_average
    FROM oura_sleep
    WHERE date >= date('now', '-30 days')
      AND (deep_sleep_minutes IS NOT NULL OR hrv_average IS NOT NULL)
  `).all();
  const deepSleepMap = new Map(
    ouraRows.filter(r => r.deep_sleep_minutes != null).map(r => [r.date, r.deep_sleep_minutes])
  );
  const hrvMap = new Map(
    ouraRows.filter(r => r.hrv_average != null).map(r => [r.date, r.hrv_average])
  );

  // --- Active energy: previous day's kcal vs current day's BP (1-day lag) ---
  // Shift each energy date forward by 1 day so it pairs with the next day's BP reading.
  const energyRows = db.prepare(`
    SELECT date(date, '+1 day') AS bp_date, active_energy_kcal
    FROM daily_summary
    WHERE date >= date('now', '-31 days') AND active_energy_kcal IS NOT NULL
  `).all();
  const activeEnergyMap = new Map(energyRows.map(r => [r.bp_date, r.active_energy_kcal]));

  // --- Oura active calories: previous day vs current day's BP (1-day lag) ---
  const ouraCalorieRows = db.prepare(`
    SELECT date(date, '+1 day') AS bp_date, active_calories
    FROM oura_activity
    WHERE date >= date('now', '-31 days') AND active_calories IS NOT NULL
  `).all();
  const ouraActiveCaloriesMap = new Map(ouraCalorieRows.map(r => [r.bp_date, r.active_calories]));

  // --- Calculate correlations ---
  const factors = [
    {
      key: 'sodium',
      label: 'Daily sodium intake',
      dataMap: sodiumMap,
      direction: { positive: 'Higher sodium intake' },
    },
    {
      key: 'hydration',
      label: 'Daily water intake',
      dataMap: hydrationMap,
      direction: { positive: 'Higher water intake' },
    },
    {
      key: 'deep_sleep',
      label: 'Deep sleep',
      dataMap: deepSleepMap,
      direction: { positive: 'More deep sleep' },
    },
    {
      key: 'hrv',
      label: 'HRV (heart rate variability)',
      dataMap: hrvMap,
      direction: { positive: 'Higher HRV' },
    },
    {
      key: 'active_energy',
      label: 'Daily active energy (kcal)',
      dataMap: activeEnergyMap,
      direction: { positive: 'More active energy burned' },
    },
    {
      key: 'oura_active_calories',
      label: 'Oura active calories (previous day)',
      dataMap: ouraActiveCaloriesMap,
      direction: { positive: 'More active calories burned' },
    },
  ];

  const results = factors.map(({ key, label, dataMap, direction }) => {
    const { xs, ys } = pairByDate(bpMap, dataMap);
    const r = pearson(ys, xs); // predictor → diastolic
    return {
      factor: key,
      label,
      r: r !== null ? Math.round(r * 1000) / 1000 : null,
      observations: xs.length,
      interpretation: interpret(r, label.toLowerCase(), direction),
    };
  });

  // Rank by absolute correlation strength, nulls last
  results.sort((a, b) => {
    if (a.r === null && b.r === null) return 0;
    if (a.r === null) return 1;
    if (b.r === null) return -1;
    return Math.abs(b.r) - Math.abs(a.r);
  });

  // --- Supplement streaks: find supplements logged 7+ consecutive days ---
  const supplementInsights = getSupplementStreakInsights(db);

  res.json({
    period: { days: 30, bp_days_with_data: bpMap.size },
    correlations: results,
    supplement_insights: supplementInsights,
  });
}

function getSupplementStreakInsights(db) {
  // Get all supplement log dates grouped by supplement name, oldest first
  const rows = db.prepare(`
    SELECT supplement_name, date
    FROM supplements_log
    GROUP BY supplement_name, date
    ORDER BY supplement_name, date ASC
  `).all();

  if (rows.length === 0) return [];

  // Group dates by supplement name
  const byName = new Map();
  for (const { supplement_name, date } of rows) {
    if (!byName.has(supplement_name)) byName.set(supplement_name, []);
    byName.get(supplement_name).push(date);
  }

  const insights = [];

  for (const [name, dates] of byName) {
    // Find the longest consecutive streak and all streaks >= 7 days
    const streaks = findStreaks(dates);
    const qualifying = streaks.filter(s => s.length >= 7);
    if (qualifying.length === 0) continue;

    // Use the earliest qualifying streak for the before/after comparison
    const streak = qualifying[0];
    const streakStart = streak.start;
    const streakEnd = streak.end;

    // Average diastolic in the 7 days before the streak started
    const before = db.prepare(`
      SELECT AVG(diastolic) AS avg_diastolic, COUNT(*) AS days
      FROM (
        SELECT date, AVG(diastolic) AS diastolic
        FROM blood_pressure
        WHERE date >= date(?, '-7 days') AND date < ?
        GROUP BY date
      )
    `).get(streakStart, streakStart);

    // Average diastolic during the streak
    const during = db.prepare(`
      SELECT AVG(diastolic) AS avg_diastolic, COUNT(*) AS days
      FROM (
        SELECT date, AVG(diastolic) AS diastolic
        FROM blood_pressure
        WHERE date >= ? AND date <= ?
        GROUP BY date
      )
    `).get(streakStart, streakEnd);

    insights.push({
      preliminary: true,
      supplement_name: name,
      streak_start: streakStart,
      streak_end: streakEnd,
      streak_days: streak.length,
      bp_before: {
        avg_diastolic: before.avg_diastolic !== null ? Math.round(before.avg_diastolic * 10) / 10 : null,
        days_with_data: before.days,
        period: `7 days before ${streakStart}`,
      },
      bp_during: {
        avg_diastolic: during.avg_diastolic !== null ? Math.round(during.avg_diastolic * 10) / 10 : null,
        days_with_data: during.days,
        period: `${streakStart} to ${streakEnd}`,
      },
      note: 'Preliminary — requires more data and does not control for other variables.',
    });
  }

  return insights;
}

// Returns an array of { start, end, length } for each consecutive daily streak in a sorted date array.
function findStreaks(sortedDates) {
  if (sortedDates.length === 0) return [];

  const streaks = [];
  let streakStart = sortedDates[0];
  let prev = sortedDates[0];
  let len = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const curr = sortedDates[i];
    const prevMs = new Date(prev).getTime();
    const currMs = new Date(curr).getTime();
    const diffDays = (currMs - prevMs) / 86400000;

    if (diffDays === 1) {
      len++;
    } else {
      streaks.push({ start: streakStart, end: prev, length: len });
      streakStart = curr;
      len = 1;
    }
    prev = curr;
  }
  streaks.push({ start: streakStart, end: prev, length: len });

  return streaks;
}
