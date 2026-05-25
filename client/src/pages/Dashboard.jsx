import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import './Dashboard.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning.'
  if (h < 17) return 'Good afternoon.'
  return 'Good evening.'
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Use local wall-clock date, not UTC — avoids off-by-one after ~8pm EST
function localTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function diastolicStatus(val) {
  if (val == null) return null
  if (val < 80) return 'green'
  if (val < 90) return 'amber'
  return 'red'
}

function parseTodayReadings(bpData) {
  if (!Array.isArray(bpData)) return { morning: null, evening: null }
  const today = localTodayStr()

  // Pre-grouped shape: { date: "YYYY-MM-DD", morning: {...}, evening: {...} }
  const grouped = bpData.find(r => String(r.date ?? '').slice(0, 10) === today)
  if (grouped?.morning || grouped?.evening) {
    return { morning: grouped.morning ?? null, evening: grouped.evening ?? null }
  }

  // Flat shape: individual rows with time_of_day / period field
  const todayRows = bpData.filter(r => {
    const d = String(r.date ?? r.recorded_at ?? r.timestamp ?? '').slice(0, 10)
    return d === today
  })
  const morning = todayRows.find(r =>
    (r.time_of_day ?? r.period ?? '').toLowerCase() === 'morning'
  )
  const evening = todayRows.find(r =>
    (r.time_of_day ?? r.period ?? '').toLowerCase() === 'evening'
  )
  return { morning: morning ?? null, evening: evening ?? null }
}

// Handles multiple API response shapes; filters out rows where r/correlation is null
function extractInsights(data) {
  let list = null
  if (Array.isArray(data)) list = data
  else if (Array.isArray(data?.insights)) list = data.insights
  else if (Array.isArray(data?.correlations)) list = data.correlations
  else if (Array.isArray(data?.data)) list = data.data
  if (!list) return []
  return list
    .filter(i => i != null && (i.r != null || i.correlation != null))
    .slice(0, 2)
}

// API fields: id, date, hrv_average, deep_sleep_minutes, total_sleep_minutes, resting_heart_rate, readiness_score
function parseOura(data) {
  if (!data) return null
  console.log('[Recovery] raw Oura response:', data)
  const hrv = data.hrv_average != null ? Math.round(data.hrv_average) : null
  const deepMinutes = data.deep_sleep_minutes ?? null
  const totalMinutes = data.total_sleep_minutes ?? null
  const restingHR = data.resting_heart_rate ?? null
  const readiness = data.readiness_score ?? null
  if (hrv == null && deepMinutes == null && readiness == null) return null
  return { hrv, deepMinutes, totalMinutes, restingHR, readiness }
}

function formatDeepSleep(minutes) {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Returns array of 7 slots { date, dayLabel, value } oldest→newest.
// value is the averaged (or single) diastolic for that day, or null for gaps.
function extractSparklineData(input) {
  console.log('[Sparkline] raw input:', JSON.stringify(input?.slice(0, 3)))

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Build fixed 7-day window ending today
  const today = new Date()
  const slots = []
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today)
    d.setDate(today.getDate() - offset)
    const dateStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-')
    slots.push({ date: dateStr, dayLabel: dayLabels[d.getDay()], value: null })
  }

  if (!Array.isArray(input)) return slots

  // Group flat readings by date, collecting morning/evening diastolic separately
  const byDate = new Map()
  for (const r of input) {
    const dateStr = String(r.date ?? '').slice(0, 10)
    if (!dateStr || r.diastolic == null) continue
    if (!byDate.has(dateStr)) byDate.set(dateStr, { morning: null, evening: null })
    const entry = byDate.get(dateStr)
    const period = (r.time_of_day ?? '').toLowerCase()
    if (period === 'morning') entry.morning = r.diastolic
    else if (period === 'evening') entry.evening = r.diastolic
  }

  const daysWithData = []

  for (const slot of slots) {
    const entry = byDate.get(slot.date)
    if (!entry) continue
    const { morning, evening } = entry
    if (morning != null && evening != null) {
      slot.value = Math.round((morning + evening) / 2)
    } else if (morning != null) {
      slot.value = morning
    } else if (evening != null) {
      slot.value = evening
    }
    if (slot.value != null) daysWithData.push(slot.date)
  }

  console.log('Days with data:', daysWithData)

  return slots
}

// Build a smooth cubic bezier path through an array of [x,y] coords.
function smoothCubicPath(pts) {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpx = (prev[0] + curr[0]) / 2
    d += ` C ${cpx},${prev[1]} ${cpx},${curr[1]} ${curr[0]},${curr[1]}`
  }
  return d
}

function diastolicDotColor(val) {
  if (val < 80) return 'var(--green)'
  if (val < 90) return 'var(--amber)'
  return 'var(--red)'
}

// Split an array into runs of consecutive items that satisfy predicate,
// returning each run as { run: [...items], startIndex: number }.
function consecutiveRuns(arr, predicate) {
  const runs = []
  let current = null
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) {
      if (!current) current = { run: [], startIndex: i }
      current.run.push(arr[i])
    } else if (current) {
      runs.push(current)
      current = null
    }
  }
  if (current) runs.push(current)
  return runs
}

function Sparkline({ slots }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  const hasAny = slots.some(s => s.value != null)

  if (!hasAny) {
    return <p className="sparkline-empty">No readings in the last 7 days.</p>
  }

  const H = 120
  const padLeft = 36
  const padRight = 8
  const padTop = 10
  const padBottom = 24

  const chartW = width - padLeft - padRight
  const chartH = H - padTop - padBottom
  const n = slots.length // always 7

  const dias = slots.filter(s => s.value != null).map(s => s.value)
  const minVal = Math.min(...dias, 70)
  const maxVal = Math.max(...dias, 95)
  const range = maxVal - minVal || 1

  function yPos(val) {
    return padTop + chartH - ((val - minVal) / range) * chartH
  }

  // X position based on slot index in the fixed 7-slot window
  function xPos(i) {
    return padLeft + (i / (n - 1)) * chartW
  }

  // Reference lines
  const refLines = [
    { val: 80, label: 'Elevated' },
    { val: 90, label: 'High' },
  ].filter(r => r.val >= minVal && r.val <= maxVal)

  // Build separate path segments for each consecutive run of non-null values
  const dataRuns = consecutiveRuns(slots, s => s.value != null)
  const pathSegments = dataRuns.map(({ run, startIndex }) =>
    smoothCubicPath(run.map((s, j) => [xPos(startIndex + j), yPos(s.value)]))
  )

  // Approximate text width for knockout rect sizing (10px font, ~6px per char)
  const labelCharWidth = 6

  return (
    <div className="sparkline-wrap" ref={wrapRef}>
      <svg className="sparkline-svg" viewBox={`0 0 ${width} ${H}`} preserveAspectRatio="none">
        {/* Reference lines — drawn first so data paints on top */}
        {refLines.map(({ val }) => {
          const y = yPos(val)
          return (
            <line
              key={val}
              className="sparkline-ref-line"
              x1={padLeft} y1={y}
              x2={width - padRight} y2={y}
            />
          )
        })}

        {pathSegments.map((d, i) => (
          <path key={i} className="sparkline-path" d={d} />
        ))}

        {slots.map((s, i) =>
          s.value != null ? (
            <circle
              key={s.date}
              cx={xPos(i)}
              cy={yPos(s.value)}
              r={4}
              fill={diastolicDotColor(s.value)}
              stroke="var(--bg-card)"
              strokeWidth={1.5}
            />
          ) : null
        )}

        {slots.map((s, i) => (
          <text
            key={`label-${s.date}`}
            className="sparkline-day-label"
            x={xPos(i)}
            y={H - 4}
          >
            {s.dayLabel}
          </text>
        ))}

        {/* Reference labels — painted last so they sit above data */}
        {refLines.map(({ val, label }) => {
          const y = yPos(val)
          const numW = String(val).length * labelCharWidth + 6
          const lblW = label.length * labelCharWidth + 6
          return (
            <g key={`lbl-${val}`}>
              {/* Left: numeric value */}
              <rect
                x={padLeft - 4 - numW}
                y={y - 6}
                width={numW}
                height={12}
                fill="var(--bg-card)"
                opacity={0.85}
                rx={2}
              />
              <text className="sparkline-ref-label" x={padLeft - 6} y={y + 3} textAnchor="end">
                {val}
              </text>
              {/* Right: text label with knockout */}
              <rect
                x={width - 2 - lblW}
                y={y - 14}
                width={lblW}
                height={12}
                fill="var(--bg-card)"
                opacity={0.85}
                rx={2}
              />
              <text className="sparkline-ref-label" x={width - 4} y={y - 5} textAnchor="end">
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function Dashboard() {
  const [bp, setBp] = useState({ data: null, loading: true, error: null })
  const [insights, setInsights] = useState({ data: null, loading: true, error: null })
  const [oura, setOura] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    api
      .bloodPressure()
      .then(data => setBp({ data, loading: false, error: null }))
      .catch(err => setBp({ data: null, loading: false, error: err.message }))

    api
      .insights()
      .then(data => setInsights({ data, loading: false, error: null }))
      .catch(err => setInsights({ data: null, loading: false, error: err.message }))

    api
      .oura()
      .then(data => setOura({ data, loading: false, error: null }))
      .catch(err => setOura({ data: null, loading: false, error: err.message }))
  }, [])

  const today = parseTodayReadings(bp.data)
  const topInsights = extractInsights(insights.data)
  const recovery = parseOura(oura.data)
  const sparkSlots = extractSparklineData(bp.data)

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <p className="dashboard-greeting">{greeting()}</p>
        <p className="dashboard-date">{formatToday()}</p>
      </header>

      <div className="dashboard-grid">
        {/* Card 1 — Blood Pressure */}
        <section className="card bp-summary-card">
          <h2 className="card-title">Today's Blood Pressure</h2>
          <div className="bp-readings">
            <BPReading label="Morning" reading={today.morning} loading={bp.loading} />
            <BPReading label="Evening" reading={today.evening} loading={bp.loading} />
          </div>
          {!bp.loading && bp.error && (
            <p className="card-notice card-notice--error">Could not load readings</p>
          )}
          {!bp.loading && !bp.error && !today.morning && !today.evening && (
            <p className="card-notice">No readings logged yet today.</p>
          )}
        </section>

        {/* Card 2 — Insights */}
        <section className="card insights-card">
          <h2 className="card-title">Correlation Insights</h2>

          {insights.loading && (
            <div className="insights-skeleton">
              <div className="loading-skeleton" style={{ height: '4rem', marginBottom: '0.625rem' }} />
              <div className="loading-skeleton" style={{ height: '4rem' }} />
            </div>
          )}

          {!insights.loading && topInsights.length === 0 && (
            <p className="card-notice">Insights will appear as more data is logged.</p>
          )}

          {topInsights.map((insight, i) => (
            <InsightRow key={i} insight={insight} />
          ))}
        </section>

        {/* Card 3 — Recovery */}
        <section className="card recovery-card">
          <h2 className="card-title">Yesterday's Recovery</h2>

          {oura.loading && (
            <div className="recovery-skeleton">
              <div className="loading-skeleton" style={{ height: '3.75rem', marginBottom: '0.5rem' }} />
              <div className="loading-skeleton" style={{ height: '3.75rem' }} />
            </div>
          )}

          {!oura.loading && !recovery && (
            <p className="card-notice">
              {oura.error
                ? 'No Oura data available.'
                : 'No recovery data for yesterday.'}
            </p>
          )}

          {recovery && (
            <div className="recovery-stats">
              <RecoveryStat
                label="HRV Average"
                value={recovery.hrv}
                unit="ms"
                missing="—"
              />
              <RecoveryStat
                label="Deep Sleep"
                value={formatDeepSleep(recovery.deepMinutes)}
                unit=""
                missing="—"
              />
              <RecoveryStat
                label="Readiness"
                value={recovery.readiness}
                unit="/ 100"
                missing="—"
              />
            </div>
          )}
        </section>
        {/* Sparkline — spans full grid width */}
        <section className="card sparkline-card">
          <h2 className="card-title">7-Day Diastolic Trend</h2>
          {bp.loading ? (
            <div className="loading-skeleton" style={{ height: '5rem', marginTop: '0.5rem' }} />
          ) : (
            <Sparkline slots={sparkSlots} />
          )}
        </section>
      </div>
    </div>
  )
}

function BPReading({ label, reading, loading }) {
  if (loading) {
    return (
      <div className="bp-reading">
        <span className="bp-label">{label}</span>
        <div
          className="loading-skeleton"
          style={{ height: '2.125rem', width: '6.25rem', marginTop: '0.625rem', borderRadius: '0.375rem' }}
        />
      </div>
    )
  }

  if (!reading) {
    return (
      <div className="bp-reading bp-reading--empty">
        <span className="bp-label">{label}</span>
        <span className="bp-no-data">No reading</span>
      </div>
    )
  }

  const { systolic: sys, diastolic: dia } = reading
  const status = diastolicStatus(dia)

  return (
    <div className="bp-reading">
      <span className="bp-label">{label}</span>
      <span className={`bp-dot bp-dot--${status}`} />
      <span className="bp-value">{sys}/{dia}</span>
      <span className="bp-unit">mmHg</span>
      <span className="bp-classification">
        {dia < 80 ? 'Normal' : dia < 90 ? 'Elevated' : 'High'}
      </span>
    </div>
  )
}

function InsightRow({ insight }) {
  const factor =
    insight.label ||
    insight.factor ||
    insight.name ||
    'Unknown factor'
  const r = insight.r ?? insight.correlation
  const direction = insight.direction || (r > 0 ? 'positive' : 'negative')
  const description = insight.insight || insight.description || insight.summary || ''
  const strength = typeof r === 'number' ? Math.abs(r) : null

  return (
    <div className="insight-row">
      <div className="insight-header">
        <span className="insight-factor">{factor}</span>
        <span className={`insight-tag insight-tag--${direction}`}>
          {direction === 'positive' ? '↑ raises BP' : '↓ lowers BP'}
        </span>
      </div>
      {strength != null && (
        <div className="insight-bar-track">
          <div
            className={`insight-bar insight-bar--${direction}`}
            style={{ width: `${Math.round(strength * 100)}%` }}
          />
        </div>
      )}
      {description && <p className="insight-desc">{description}</p>}
    </div>
  )
}

function RecoveryStat({ label, value, unit, missing }) {
  const display = value != null ? String(value) : null

  return (
    <div className="recovery-stat">
      <div className="recovery-stat-value-row">
        {display != null ? (
          <>
            <span className="recovery-stat-value">{display}</span>
            {unit && <span className="recovery-stat-unit">{unit}</span>}
          </>
        ) : (
          <span className="recovery-stat-missing">{missing}</span>
        )}
      </div>
      <span className="recovery-stat-label">{label}</span>
    </div>
  )
}
