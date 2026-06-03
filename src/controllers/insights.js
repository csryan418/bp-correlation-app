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

export function getFullInsights(req, res) {
  const db = getDb();

  // Pearson r with 7-pair minimum threshold
  function pearson7(xs, ys) {
    const n = xs.length;
    if (n < 7) return null;
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanY = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX, dy = ys[i] - meanY;
      num += dx * dy; varX += dx * dx; varY += dy * dy;
    }
    const denom = Math.sqrt(varX * varY);
    return denom === 0 ? null : num / denom;
  }

  function round2(v) { return v != null ? Math.round(v * 100) / 100 : null; }

  // Build next-morning BP map: key = variable_date (bp.date - 1), value = {diastolic, systolic}
  const morningBP = db.prepare(`
    SELECT date, systolic, diastolic FROM blood_pressure WHERE time_of_day = 'morning'
  `).all();
  const bpNextMorning = new Map();
  for (const row of morningBP) {
    const d = new Date(row.date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const varDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    bpNextMorning.set(varDate, { diastolic: row.diastolic, systolic: row.systolic });
  }

  // Build paired lists [xs, dias, syss, dates] from a variable map
  function buildPairs(varMap) {
    const xs = [], dias = [], syss = [], dates = [];
    for (const [date, x] of varMap) {
      const bp = bpNextMorning.get(date);
      if (bp && bp.diastolic != null && bp.systolic != null && x != null) {
        xs.push(x); dias.push(bp.diastolic); syss.push(bp.systolic); dates.push(date);
      }
    }
    return { xs, dias, syss, dates };
  }

  function calcCorr(varMap, name, unit) {
    const { xs, dias, syss } = buildPairs(varMap);
    const n = xs.length;
    return {
      variable: name,
      unit,
      r_diastolic: round2(pearson7(xs, dias)),
      r_systolic: round2(pearson7(xs, syss)),
      n,
    };
  }

  function buildScatter(varMap) {
    const { xs, dias, syss, dates } = buildPairs(varMap);
    return xs.map((x, i) => ({ x, dia: dias[i], sys: syss[i], date: dates[i] }));
  }

  // ── Sleep ────────────────────────────────────────────────────
  const sleepRows = db.prepare(`
    SELECT date, hrv_average, deep_sleep_minutes, total_sleep_minutes, readiness_score FROM oura_sleep
  `).all();
  const hrvMap        = new Map(sleepRows.filter(r => r.hrv_average        != null).map(r => [r.date, r.hrv_average]));
  const deepMap       = new Map(sleepRows.filter(r => r.deep_sleep_minutes != null).map(r => [r.date, r.deep_sleep_minutes]));
  const totalSleepMap = new Map(sleepRows.filter(r => r.total_sleep_minutes != null).map(r => [r.date, r.total_sleep_minutes]));
  const readinessMap  = new Map(sleepRows.filter(r => r.readiness_score    != null).map(r => [r.date, r.readiness_score]));

  // ── Activity ─────────────────────────────────────────────────
  const actRows = db.prepare(`
    SELECT date, active_calories, steps, activity_score FROM oura_activity
  `).all();
  const activeCalMap     = new Map(actRows.filter(r => r.active_calories != null).map(r => [r.date, r.active_calories]));
  const stepsMap         = new Map(actRows.filter(r => r.steps           != null).map(r => [r.date, r.steps]));
  const activityScoreMap = new Map(actRows.filter(r => r.activity_score  != null).map(r => [r.date, r.activity_score]));

  // ── Minerals ─────────────────────────────────────────────────
  const foodDailyRows = db.prepare(`
    SELECT date,
      SUM(COALESCE(sodium_mg, 0))    AS total_sodium,
      SUM(COALESCE(potassium_mg, 0)) AS total_potassium,
      SUM(COALESCE(magnesium_mg, 0)) AS total_magnesium
    FROM food_log GROUP BY date
  `).all();
  const sodiumMap    = new Map(foodDailyRows.map(r => [r.date, r.total_sodium]));
  const potassiumMap = new Map(foodDailyRows.map(r => [r.date, r.total_potassium]));
  const magnesiumMap = new Map(foodDailyRows.map(r => [r.date, r.total_magnesium]));
  const nakMap       = new Map(
    foodDailyRows
      .filter(r => r.total_potassium > 0)
      .map(r => [r.date, r.total_sodium / r.total_potassium])
  );

  // ── Correlations ─────────────────────────────────────────────
  const correlations = [
    calcCorr(hrvMap,        'HRV Average',              'ms'),
    calcCorr(deepMap,       'Deep Sleep',               'min'),
    calcCorr(totalSleepMap, 'Total Sleep',              'min'),
    calcCorr(readinessMap,  'Readiness Score',          ''),
    calcCorr(activeCalMap,  'Active Calories',          'kcal'),
    calcCorr(stepsMap,      'Steps',                    ''),
    calcCorr(activityScoreMap, 'Activity Score',        ''),
    calcCorr(sodiumMap,     'Daily Sodium',             'mg'),
    calcCorr(potassiumMap,  'Daily Potassium',          'mg'),
    calcCorr(magnesiumMap,  'Daily Magnesium',          'mg'),
    calcCorr(nakMap,        'Sodium:Potassium Ratio',   ':1'),
  ];
  correlations.sort((a, b) => {
    const absA = a.r_diastolic != null ? Math.abs(a.r_diastolic) : -1;
    const absB = b.r_diastolic != null ? Math.abs(b.r_diastolic) : -1;
    return absB - absA;
  });

  // ── Meal-level insights ──────────────────────────────────────
  const foodDateRows = db.prepare(`
    SELECT food_name, date FROM food_log GROUP BY food_name, date ORDER BY food_name
  `).all();
  const foodDateMap = new Map();
  for (const { food_name, date } of foodDateRows) {
    if (!foodDateMap.has(food_name)) foodDateMap.set(food_name, new Set());
    foodDateMap.get(food_name).add(date);
  }

  const allVarDates = new Set(bpNextMorning.keys());
  const mealInsights = [];

  for (const [food, datesSet] of foodDateMap) {
    if (datesSet.size < 3) continue;
    const onDays  = [...datesSet].filter(d => allVarDates.has(d));
    if (onDays.length < 3) continue;
    const offDays = [...allVarDates].filter(d => !datesSet.has(d) && bpNextMorning.get(d)?.diastolic != null);
    if (offDays.length === 0) continue;

    const avgDiaOn  = onDays.reduce( (s, d) => s + bpNextMorning.get(d).diastolic, 0) / onDays.length;
    const avgDiaOff = offDays.reduce((s, d) => s + bpNextMorning.get(d).diastolic, 0) / offDays.length;
    const avgSysOn  = onDays.reduce( (s, d) => s + bpNextMorning.get(d).systolic,  0) / onDays.length;
    const avgSysOff = offDays.reduce((s, d) => s + bpNextMorning.get(d).systolic,  0) / offDays.length;
    const diaDiff   = Math.abs(avgDiaOn - avgDiaOff);
    if (diaDiff < 3) continue;

    mealInsights.push({
      food,
      avg_dia_on:  round2(avgDiaOn),
      avg_dia_off: round2(avgDiaOff),
      avg_sys_on:  round2(avgSysOn),
      avg_sys_off: round2(avgSysOff),
      n_on:  onDays.length,
      n_off: offDays.length,
      dia_diff: round2(diaDiff),
    });
  }
  mealInsights.sort((a, b) => b.dia_diff - a.dia_diff);
  const topMealInsights = mealInsights.slice(0, 10);

  // ── Coming soon: thresholds ───────────────────────────────────
  const hydrationDays   = db.prepare(`SELECT COUNT(DISTINCT date) AS n FROM hydration_log WHERE water_oz > 0`).get().n;
  const supplementDays  = db.prepare(`SELECT COUNT(DISTINCT date) AS n FROM supplement_logs WHERE taken = 1`).get().n;

  res.json({
    correlations,
    mealInsights: topMealInsights,
    scatterData: {
      sodium:        buildScatter(sodiumMap),
      potassium:     buildScatter(potassiumMap),
      magnesium:     buildScatter(magnesiumMap),
      nakRatio:      buildScatter(nakMap),
      hrv:           buildScatter(hrvMap),
      deepSleep:     buildScatter(deepMap),
      readiness:     buildScatter(readinessMap),
      activeCalories: buildScatter(activeCalMap),
      activityScore: buildScatter(activityScoreMap),
    },
    thresholds: {
      hydration_days:  hydrationDays,
      supplement_days: supplementDays,
    },
  });
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
