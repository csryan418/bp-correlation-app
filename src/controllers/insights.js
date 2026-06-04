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
    SELECT s.name AS supplement_name, sl.date
    FROM supplement_logs sl JOIN supplements s ON s.id = sl.supplement_id
    GROUP BY s.name, sl.date
    ORDER BY s.name, sl.date ASC
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

  // ── Hydration ────────────────────────────────────────────────
  const hydrationRows = db.prepare(`
    SELECT date, SUM(water_oz) AS total_oz FROM hydration_log GROUP BY date
  `).all();
  const hydrationMap = new Map(hydrationRows.map(r => [r.date, r.total_oz]));

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
    calcCorr(hydrationMap,  'Daily Water Intake',       'oz'),
  ];
  correlations.sort((a, b) => {
    const absA = a.r_diastolic != null ? Math.abs(a.r_diastolic) : -1;
    const absB = b.r_diastolic != null ? Math.abs(b.r_diastolic) : -1;
    return absB - absA;
  });

  // ── Meal sodium correlation ───────────────────────────────────
  const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

  const mealSodiumByDateStmt = db.prepare(`
    SELECT date, SUM(COALESCE(sodium_mg, 0)) AS total_sodium
    FROM food_log
    WHERE meal_type = ?
    GROUP BY date
  `);
  const mealItemsStmt = db.prepare(`
    SELECT food_name, sodium_mg, date
    FROM food_log
    WHERE meal_type = ? AND sodium_mg IS NOT NULL
  `);
  const mealSodiumCorrelation = [];

  for (const mealType of MEAL_TYPES) {
    const sodiumByDate = mealSodiumByDateStmt.all(mealType);

    const paired = sodiumByDate
      .map(r => {
        const bp = bpNextMorning.get(r.date);
        if (!bp || bp.diastolic == null || bp.systolic == null) return null;
        return { date: r.date, sodium: r.total_sodium, diastolic: bp.diastolic, systolic: bp.systolic };
      })
      .filter(Boolean);

    if (paired.length < 7) {
      mealSodiumCorrelation.push({ meal_type: mealType, paired_days: paired.length, below_threshold: true });
      continue;
    }

    const sortedBySodium = [...paired].sort((a, b) => a.sodium - b.sodium);
    const mid = Math.floor(sortedBySodium.length / 2);
    const medianSodium = sortedBySodium.length % 2 !== 0
      ? sortedBySodium[mid].sodium
      : (sortedBySodium[mid - 1].sodium + sortedBySodium[mid].sodium) / 2;

    const highDays = paired.filter(p => p.sodium > medianSodium);
    const lowDays  = paired.filter(p => p.sodium <= medianSodium);

    const avgDiaHigh = highDays.length > 0 ? highDays.reduce((s, p) => s + p.diastolic, 0) / highDays.length : null;
    const avgDiaLow  = lowDays.length  > 0 ? lowDays.reduce( (s, p) => s + p.diastolic, 0) / lowDays.length  : null;
    const avgSysHigh = highDays.length > 0 ? highDays.reduce((s, p) => s + p.systolic,  0) / highDays.length : null;
    const avgSysLow  = lowDays.length  > 0 ? lowDays.reduce( (s, p) => s + p.systolic,  0) / lowDays.length  : null;

    const highDatesSorted = highDays.map(p => p.date).sort();
    const lastHighSodiumDate = highDatesSorted.length > 0 ? highDatesSorted[highDatesSorted.length - 1] : null;

    const highDateSet = new Set(highDays.map(p => p.date));
    const allItems = mealItemsStmt.all(mealType);
    let topItem = null;
    for (const item of allItems) {
      if (!highDateSet.has(item.date)) continue;
      if (!topItem || item.sodium_mg > topItem.sodium_mg) {
        topItem = { food_name: item.food_name, sodium_mg: item.sodium_mg };
      }
    }

    mealSodiumCorrelation.push({
      meal_type:    mealType,
      median_sodium: round2(medianSodium),
      avg_dia_high:  round2(avgDiaHigh),
      avg_dia_low:   round2(avgDiaLow),
      avg_sys_high:  round2(avgSysHigh),
      avg_sys_low:   round2(avgSysLow),
      difference:    avgDiaHigh != null && avgDiaLow != null ? round2(avgDiaHigh - avgDiaLow) : null,
      paired_days:   paired.length,
      last_high_sodium_date: lastHighSodiumDate,
      top_sodium_item: topItem,
      below_threshold: false,
    });
  }

  // ── Individual food-level insights ────────────────────────────
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

  // ── Hydration high/low insight ────────────────────────────────
  let hydrationInsight = null;
  {
    const { xs, dias } = buildPairs(hydrationMap);
    if (xs.length >= 7) {
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

      const highDias = xs.map((x, i) => ({ x, dia: dias[i] })).filter(p => p.x >= median).map(p => p.dia);
      const lowDias  = xs.map((x, i) => ({ x, dia: dias[i] })).filter(p => p.x <  median).map(p => p.dia);

      hydrationInsight = {
        paired_days: xs.length,
        median_oz:   round2(median),
        avg_dia_high: highDias.length > 0 ? round2(highDias.reduce((s, v) => s + v, 0) / highDias.length) : null,
        avg_dia_low:  lowDias.length  > 0 ? round2(lowDias.reduce( (s, v) => s + v, 0) / lowDias.length)  : null,
      };
    }
  }

  // ── Supplement correlation ────────────────────────────────────
  const activeSupplements = db.prepare(
    `SELECT id, name FROM supplements WHERE active = 1 ORDER BY name`
  ).all();
  const takenStmt = db.prepare(
    `SELECT date FROM supplement_logs sl JOIN supplements s ON s.id = sl.supplement_id WHERE supplement_id = ? AND taken = 1`
  );
  const supplementCorrelations = [];

  for (const supp of activeSupplements) {
    const takenDates = new Set(takenStmt.all(supp.id).map(r => r.date));

    const takenPaired = [...takenDates].filter(d => {
      const bp = bpNextMorning.get(d);
      return bp && bp.diastolic != null && bp.systolic != null;
    });
    const daysTaken = takenPaired.length;

    if (daysTaken < 7) {
      supplementCorrelations.push({
        supplement_id: supp.id,
        name: supp.name,
        days_taken: daysTaken,
        below_threshold: true,
      });
      continue;
    }

    const notTakenPaired = [...bpNextMorning.keys()].filter(d => {
      if (takenDates.has(d)) return false;
      const bp = bpNextMorning.get(d);
      return bp && bp.diastolic != null && bp.systolic != null;
    });
    const daysNotTaken = notTakenPaired.length;

    const avgDiaTaken = takenPaired.reduce((s, d) => s + bpNextMorning.get(d).diastolic, 0) / daysTaken;
    const avgSysTaken = takenPaired.reduce((s, d) => s + bpNextMorning.get(d).systolic,  0) / daysTaken;
    const avgDiaNotTaken = daysNotTaken > 0
      ? notTakenPaired.reduce((s, d) => s + bpNextMorning.get(d).diastolic, 0) / daysNotTaken
      : null;
    const avgSysNotTaken = daysNotTaken > 0
      ? notTakenPaired.reduce((s, d) => s + bpNextMorning.get(d).systolic,  0) / daysNotTaken
      : null;

    supplementCorrelations.push({
      supplement_id: supp.id,
      name: supp.name,
      avg_diastolic_taken:     round2(avgDiaTaken),
      avg_systolic_taken:      round2(avgSysTaken),
      avg_diastolic_not_taken: round2(avgDiaNotTaken),
      avg_systolic_not_taken:  round2(avgSysNotTaken),
      days_taken:    daysTaken,
      days_not_taken: daysNotTaken,
      difference: avgDiaNotTaken != null ? round2(avgDiaTaken - avgDiaNotTaken) : null,
      below_threshold: false,
    });
  }

  supplementCorrelations.sort((a, b) => {
    if (a.below_threshold !== b.below_threshold) return a.below_threshold ? 1 : -1;
    if (a.difference == null && b.difference == null) return 0;
    if (a.difference == null) return 1;
    if (b.difference == null) return -1;
    return Math.abs(b.difference) - Math.abs(a.difference);
  });

  // ── Coming soon: thresholds ───────────────────────────────────
  const hydrationDays  = db.prepare(`SELECT COUNT(DISTINCT date) AS n FROM hydration_log WHERE water_oz > 0`).get().n;

  res.json({
    correlations,
    mealInsights: topMealInsights,
    mealSodiumCorrelation,
    scatterData: {
      sodium:         buildScatter(sodiumMap),
      potassium:      buildScatter(potassiumMap),
      magnesium:      buildScatter(magnesiumMap),
      nakRatio:       buildScatter(nakMap),
      hrv:            buildScatter(hrvMap),
      deepSleep:      buildScatter(deepMap),
      readiness:      buildScatter(readinessMap),
      activeCalories: buildScatter(activeCalMap),
      activityScore:  buildScatter(activityScoreMap),
    },
    hydrationInsight,
    supplementCorrelations,
    thresholds: {
      hydration_days: hydrationDays,
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
