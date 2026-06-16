#!/usr/bin/env node
/**
 * BP Journal — read-only MCP server
 *
 * Exposes the BP Journal health database to Claude Desktop over stdio.
 * Everything here is READ-ONLY: the SQLite handle is opened with
 * { readonly: true } and no tool issues a write. This server is purely
 * additive and does not touch the main app's code.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The LIVE database is data/health.db (the empty root health.db is NOT used).
const DB_PATH = join(__dirname, '..', 'data', 'health.db');

// Read-only handle. fileMustExist guards against silently creating an empty DB.
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

// The app's correlation backend.
const INSIGHTS_URL = 'http://localhost:3001/api/insights/full';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value, label) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new Error(`Invalid ${label}: expected YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
}

/** Add `days` to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD strings from start to end. */
function dateSeries(start, end) {
  const out = [];
  let cur = start;
  // Guard against reversed ranges / runaway loops.
  for (let i = 0; i <= 366 * 5 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prepared queries (read-only)
// ---------------------------------------------------------------------------

const q = {
  bpForDate: db.prepare(
    `SELECT time_of_day, systolic, diastolic, notes, source
       FROM blood_pressure WHERE date = ? ORDER BY time_of_day`
  ),
  foodForDate: db.prepare(
    `SELECT meal_type, food_name, serving_size, sodium_mg, potassium_mg, magnesium_mg, calories
       FROM food_log WHERE date = ? ORDER BY logged_time`
  ),
  // Workouts have timestamp start_time; match by its date portion.
  workoutsForDate: db.prepare(
    `SELECT workout_type, start_time, duration_minutes, calories, avg_heart_rate
       FROM workouts WHERE substr(start_time, 1, 10) = ? ORDER BY start_time`
  ),
  checkinForDate: db.prepare(
    `SELECT eight_sleep, stress_level, energy_level
       FROM daily_checkins WHERE date = ? LIMIT 1`
  ),
  // supplement_logs can contain duplicate rows; DISTINCT collapses them.
  supplementsForDate: db.prepare(
    `SELECT DISTINCT s.name, s.dose, s.unit, l.time_of_day
       FROM supplement_logs l
       JOIN supplements s ON s.id = l.supplement_id
      WHERE l.date = ? AND l.taken = 1
      ORDER BY l.time_of_day, s.name`
  ),
  ouraSleepForDate: db.prepare(
    `SELECT deep_sleep_minutes, total_sleep_minutes, hrv_average, resting_heart_rate, readiness_score
       FROM oura_sleep WHERE date = ? LIMIT 1`
  ),
  ouraActivityForDate: db.prepare(
    `SELECT active_calories, total_calories, steps, equivalent_walking_distance, activity_score
       FROM oura_activity WHERE date = ? LIMIT 1`
  ),
  sodiumForDate: db.prepare(
    `SELECT COALESCE(SUM(sodium_mg), 0) AS total_sodium_mg,
            COALESCE(SUM(calories), 0)  AS total_calories
       FROM food_log WHERE date = ?`
  ),
  waterForDate: db.prepare(
    `SELECT COALESCE(SUM(water_oz), 0) AS water_oz FROM hydration_log WHERE date = ?`
  ),
  workoutSummaryForDate: db.prepare(
    `SELECT COUNT(*) AS workout_count,
            COALESCE(SUM(duration_minutes), 0) AS total_duration_minutes
       FROM workouts WHERE substr(start_time, 1, 10) = ?`
  ),
  morningDiastolicForDate: db.prepare(
    `SELECT diastolic, systolic
       FROM blood_pressure WHERE date = ? AND time_of_day = 'morning' LIMIT 1`
  ),
  bpStats: db.prepare(
    `SELECT time_of_day,
            COUNT(*)        AS readings,
            ROUND(AVG(systolic), 1)  AS avg_systolic,
            MIN(systolic)   AS min_systolic,
            MAX(systolic)   AS max_systolic,
            ROUND(AVG(diastolic), 1) AS avg_diastolic,
            MIN(diastolic)  AS min_diastolic,
            MAX(diastolic)  AS max_diastolic
       FROM blood_pressure
      WHERE date BETWEEN ? AND ?
      GROUP BY time_of_day`
  ),
};

/** Full cross-table context for a single day. */
function dayContext(date) {
  return {
    date,
    blood_pressure: q.bpForDate.all(date),
    food_log: q.foodForDate.all(date),
    workouts: q.workoutsForDate.all(date),
    daily_checkins: q.checkinForDate.get(date) || null,
    supplements_taken: q.supplementsForDate.all(date),
    oura_sleep: q.ouraSleepForDate.get(date) || null,
    oura_activity: q.ouraActivityForDate.get(date) || null,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_insights',
    description:
      "Fetch the BP Journal app's correlation analysis (its next-morning-diastolic " +
      'Pearson engine via GET /api/insights/full). These are HISTORICAL correlations ' +
      'computed across ALL logged data — useful for GROUNDING explanations of trends. ' +
      'They are NOT proof of causation for any single day. Requires the app backend to ' +
      'be running on localhost:3001. Takes no parameters.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_day',
    description:
      'Return the full cross-table context (blood pressure, food, workouts, check-in, ' +
      'supplements, Oura sleep & activity) for a given date AND the day before it. ' +
      "The prior day is included because the app's model is that a day's behavior " +
      "affects the NEXT morning's blood pressure. For 'why did my BP spike on X' " +
      'questions, the relevant behaviors are often on the PRIOR day — explain what was ' +
      'DIFFERENT between the days and reference historical correlations (get_insights). ' +
      'Do NOT assert that any single day\'s behavior caused the BP reading. Note: in ' +
      'daily_checkins, eight_sleep is a 0/1 boolean (1 = slept on the Eight Sleep ' +
      "mattress). eight_sleep is SAME-DAY relative to that date's morning BP — it " +
      "answers \"did I sleep on the Eight Sleep mattress the night before this date's " +
      'morning BP reading," so pair it with the SAME date\'s morning BP, not the prior day.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Target date, YYYY-MM-DD' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_range',
    description:
      "Return one row per day in [start, end], each bundling that day's behaviors " +
      '(workout count/duration, total sodium, water, sleep) PAIRED WITH THE ' +
      "NEXT MORNING's blood pressure (the morning reading of date+1). This next-morning " +
      'pairing is deliberate: it directly answers questions like "did my BP rise the ' +
      'morning after I ate salty / skipped working out." The behaviors on each ' +
      'row and the next_morning_diastolic on that same row are offset by one calendar day. ' +
      'Exception: eight_sleep is SAME-DAY relative to that date\'s morning BP (it describes ' +
      "the night that produced this date's morning reading), so pair eight_sleep with the " +
      'same date\'s morning BP, not the next morning.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date inclusive, YYYY-MM-DD' },
        end: { type: 'string', description: 'End date inclusive, YYYY-MM-DD' },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_bp_stats',
    description:
      'Return blood-pressure summary statistics (average / min / max systolic and ' +
      'diastolic, plus reading count) over [start, end], split by morning vs evening ' +
      '(time_of_day). Useful for a quick overview of BP levels and variability across a period.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date inclusive, YYYY-MM-DD' },
        end: { type: 'string', description: 'End date inclusive, YYYY-MM-DD' },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function getInsights() {
  try {
    const res = await fetch(INSIGHTS_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`backend returned HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      note:
        'HISTORICAL correlations across all logged data — useful for grounding ' +
        'explanations, NOT proof of causation for any single day.',
      insights: data,
    };
  } catch (err) {
    throw new Error(
      `Could not fetch insights from ${INSIGHTS_URL}: ${err.message}. ` +
        'The BP Journal backend must be running (npm start in ~/bp-correlation, ' +
        'listening on localhost:3001) for this tool to work.'
    );
  }
}

function getDay({ date }) {
  assertDate(date, 'date');
  const priorDate = addDays(date, -1);
  return {
    note:
      "The app's model is that a day's behavior affects the NEXT morning's BP, so the " +
      'prior day is included. Explain what was DIFFERENT between the days and reference ' +
      'historical correlations; do not assert single-day causation.',
    target_day: dayContext(date),
    prior_day: dayContext(priorDate),
  };
}

function getRange({ start, end }) {
  assertDate(start, 'start');
  assertDate(end, 'end');
  if (start > end) throw new Error('start must be on or before end');

  const days = dateSeries(start, end).map((date) => {
    const checkin = q.checkinForDate.get(date);
    const sodium = q.sodiumForDate.get(date);
    const water = q.waterForDate.get(date);
    const workout = q.workoutSummaryForDate.get(date);
    const sleep = q.ouraSleepForDate.get(date);
    const nextMorningDate = addDays(date, 1);
    const nextMorning = q.morningDiastolicForDate.get(nextMorningDate);

    return {
      date,
      behaviors: {
        eight_sleep: checkin ? checkin.eight_sleep : null, // 0/1 boolean; SAME-DAY relative to this date's morning BP
        stress_level: checkin ? checkin.stress_level : null,
        energy_level: checkin ? checkin.energy_level : null,
        workout_count: workout.workout_count,
        workout_duration_minutes: workout.total_duration_minutes,
        total_sodium_mg: sodium.total_sodium_mg,
        total_calories: sodium.total_calories,
        water_oz: water.water_oz,
        total_sleep_minutes: sleep ? sleep.total_sleep_minutes : null,
      },
      next_morning_date: nextMorningDate,
      next_morning_diastolic: nextMorning ? nextMorning.diastolic : null,
      next_morning_systolic: nextMorning ? nextMorning.systolic : null,
    };
  });

  return {
    note:
      "Each row's behaviors are paired with the NEXT morning's BP (morning reading of " +
      'date+1) — a one-day offset by design, matching the app correlation model.',
    days,
  };
}

function getBpStats({ start, end }) {
  assertDate(start, 'start');
  assertDate(end, 'end');
  if (start > end) throw new Error('start must be on or before end');

  const rows = q.bpStats.all(start, end);
  const byPeriod = { morning: null, evening: null };
  for (const r of rows) {
    if (r.time_of_day === 'morning' || r.time_of_day === 'evening') {
      byPeriod[r.time_of_day] = r;
    }
  }
  return { range: { start, end }, morning: byPeriod.morning, evening: byPeriod.evening };
}

// ---------------------------------------------------------------------------
// Server wiring
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'bp-journal', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    let result;
    switch (name) {
      case 'get_insights':
        result = await getInsights();
        break;
      case 'get_day':
        result = getDay(args);
        break;
      case 'get_range':
        result = getRange(args);
        break;
      case 'get_bp_stats':
        result = getBpStats(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error in ${name}: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Logs must go to stderr so they don't corrupt the stdio JSON-RPC stream.
console.error('BP Journal MCP server running on stdio (read-only).');
