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
