import { getDb } from '../db/index.js';

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

function shiftDateForward(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function medianOf(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function avgOf(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function interpretRecoveryBP(r, metric) {
  if (r === null) return 'Not enough overlapping data to calculate this correlation.';
  const abs = Math.abs(r);
  if (abs < 0.1) return `No meaningful association found between ${metric} and next-day BP.`;
  const strength = abs >= 0.6 ? 'strongly' : abs >= 0.3 ? 'moderately' : 'weakly';
  const direction = r < 0
    ? `Higher ${metric} is ${strength} associated with lower next-day BP.`
    : `Higher ${metric} is ${strength} associated with higher next-day BP.`;
  return direction;
}

export function getSleepTrends(req, res) {
  const db = getDb();

  // Yesterday's date (server local time) — most recent valid Oura data point
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');

  // Last 30 days ending yesterday
  const rows = db.prepare(`
    SELECT date, hrv_average, deep_sleep_minutes, resting_heart_rate, readiness_score
    FROM oura_sleep
    WHERE date >= date(?, '-29 days') AND date <= ?
    ORDER BY date ASC
  `).all(yesterday, yesterday);

  // Recovery → next-day BP correlation (readiness → next-day avg systolic + diastolic)
  const bpRows = db.prepare(`
    SELECT date, AVG(systolic) AS avg_systolic, AVG(diastolic) AS avg_diastolic
    FROM blood_pressure
    GROUP BY date
  `).all();
  const bpByDate = new Map(bpRows.map(r => [r.date, r]));

  const readinessXs = [], systolicYs = [], diastolicYs = [];
  for (const row of rows) {
    if (row.readiness_score == null) continue;
    // Shift readiness date forward 1 day to pair with next-day BP
    const nextDay = new Date(row.date + 'T00:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = [
      nextDay.getFullYear(),
      String(nextDay.getMonth() + 1).padStart(2, '0'),
      String(nextDay.getDate()).padStart(2, '0'),
    ].join('-');
    const bp = bpByDate.get(nextDayStr);
    if (bp?.avg_systolic != null && bp?.avg_diastolic != null) {
      readinessXs.push(row.readiness_score);
      systolicYs.push(bp.avg_systolic);
      diastolicYs.push(bp.avg_diastolic);
    }
  }

  const rSystolic  = readinessXs.length >= 3 ? pearson(readinessXs, systolicYs)  : null;
  const rDiastolic = readinessXs.length >= 3 ? pearson(readinessXs, diastolicYs) : null;

  const roundR = r => r !== null ? Math.round(r * 1000) / 1000 : null;

  res.json({
    trends: rows,
    correlation: {
      observations: readinessXs.length,
      r_systolic:  roundR(rSystolic),
      r_diastolic: roundR(rDiastolic),
      interpretation_systolic:  interpretRecoveryBP(rSystolic,  'readiness score'),
      interpretation_diastolic: interpretRecoveryBP(rDiastolic, 'readiness score'),
    },
  });
}

export function getHrvInsights(req, res) {
  const db = getDb();

  const sleepRows = db.prepare(`
    SELECT date, hrv_average, deep_sleep_minutes
    FROM oura_sleep
    ORDER BY date ASC
  `).all();

  const sleepByDate = new Map(sleepRows.map(r => [r.date, r]));

  const morningBpRows = db.prepare(`
    SELECT date, AVG(systolic) AS avg_sys, AVG(diastolic) AS avg_dia
    FROM blood_pressure
    WHERE time_of_day = 'morning'
    GROUP BY date
  `).all();
  const morningBpByDate = new Map(morningBpRows.map(r => [r.date, r]));

  const deepHrvXs = [], deepHrvYs = [];
  const hrvDiaXs = [], hrvDiaYs = [], hrvSysYs = [];
  const deepDiaXs = [], deepDiaYs = [], deepSysYs = [];

  for (const row of sleepRows) {
    const nd = shiftDateForward(row.date);

    if (row.deep_sleep_minutes != null) {
      const nextSleep = sleepByDate.get(nd);
      if (nextSleep?.hrv_average != null) {
        deepHrvXs.push(row.deep_sleep_minutes);
        deepHrvYs.push(nextSleep.hrv_average);
      }
    }

    if (row.hrv_average != null) {
      const bp = morningBpByDate.get(nd);
      if (bp?.avg_dia != null) {
        hrvDiaXs.push(row.hrv_average);
        hrvDiaYs.push(bp.avg_dia);
        hrvSysYs.push(bp.avg_sys);
      }
    }

    if (row.deep_sleep_minutes != null) {
      const bp = morningBpByDate.get(nd);
      if (bp?.avg_dia != null) {
        deepDiaXs.push(row.deep_sleep_minutes);
        deepDiaYs.push(bp.avg_dia);
        deepSysYs.push(bp.avg_sys);
      }
    }
  }

  const MIN_N = 7;
  const roundR = r => r !== null ? Math.round(r * 1000) / 1000 : null;
  const round1 = v => v !== null ? Math.round(v * 10) / 10 : null;

  const rDeepHrv = deepHrvXs.length >= MIN_N ? pearson(deepHrvXs, deepHrvYs) : null;
  const rHrvDia  = hrvDiaXs.length >= MIN_N  ? pearson(hrvDiaXs, hrvDiaYs)   : null;
  const rHrvSys  = hrvDiaXs.length >= MIN_N  ? pearson(hrvDiaXs, hrvSysYs)   : null;
  const rDeepDia = deepDiaXs.length >= MIN_N ? pearson(deepDiaXs, deepDiaYs) : null;
  const rDeepSys = deepDiaXs.length >= MIN_N ? pearson(deepDiaXs, deepSysYs) : null;

  let medianHrv = null, highHrvDia = null, lowHrvDia = null;
  if (hrvDiaXs.length >= MIN_N) {
    medianHrv = medianOf(hrvDiaXs);
    highHrvDia = avgOf(hrvDiaYs.filter((_, i) => hrvDiaXs[i] >= medianHrv));
    lowHrvDia  = avgOf(hrvDiaYs.filter((_, i) => hrvDiaXs[i] < medianHrv));
  }

  let medianDeep = null, highDeepDia = null, lowDeepDia = null;
  if (deepDiaXs.length >= MIN_N) {
    medianDeep = medianOf(deepDiaXs);
    highDeepDia = avgOf(deepDiaYs.filter((_, i) => deepDiaXs[i] >= medianDeep));
    lowDeepDia  = avgOf(deepDiaYs.filter((_, i) => deepDiaXs[i] < medianDeep));
  }

  res.json({
    observations: hrvDiaXs.length,
    deep_hrv: { r: roundR(rDeepHrv), n: deepHrvXs.length },
    hrv_bp:   { r_diastolic: roundR(rHrvDia), r_systolic: roundR(rHrvSys), n: hrvDiaXs.length },
    deep_bp:  { r_diastolic: roundR(rDeepDia), r_systolic: roundR(rDeepSys), n: deepDiaXs.length },
    chain: {
      median_hrv:    medianHrv  !== null ? Math.round(medianHrv)  : null,
      high_hrv_dia:  round1(highHrvDia),
      low_hrv_dia:   round1(lowHrvDia),
      median_deep:   medianDeep !== null ? Math.round(medianDeep) : null,
      high_deep_dia: round1(highDeepDia),
      low_deep_dia:  round1(lowDeepDia),
    },
  });
}
