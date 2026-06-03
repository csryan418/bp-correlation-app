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

// API fields: date, activity_score, steps, active_calories, equivalent_walking_distance
function parseActivity(data) {
  if (!data) return null
  const score = data.activity_score ?? null
  const steps = data.steps ?? null
  const calories = data.active_calories ?? null
  const distMeters = data.equivalent_walking_distance ?? null
  const distMiles = distMeters != null ? (distMeters * 0.000621371).toFixed(1) : null
  if (score == null && steps == null && calories == null) return null
  return { score, steps, calories, distMiles }
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

// Returns flat readings for the last 7 days, sorted oldest→newest then morning→evening.
function extractBPReadings(data) {
  if (!Array.isArray(data)) return []
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 6)
  cutoff.setHours(0, 0, 0, 0)
  const cutoffMs = cutoff.getTime()
  return data
    .filter(r => {
      const date = String(r.date || '').slice(0, 10)
      if (!date || r.systolic == null || r.diastolic == null) return false
      return new Date(date + 'T12:00:00').getTime() >= cutoffMs
    })
    .sort((a, b) => {
      const dc = String(a.date).localeCompare(String(b.date))
      if (dc !== 0) return dc
      const order = { morning: 0, evening: 1 }
      return (order[(a.time_of_day || '').toLowerCase()] ?? 0) -
             (order[(b.time_of_day || '').toLowerCase()] ?? 0)
    })
}

function formatBPDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function BPTrendChart({ readings }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(600)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  if (!readings.length) {
    return <p className="sparkline-empty">No readings in the last 7 days.</p>
  }

  const H = 160
  const padLeft = 34
  const padRight = 35
  const padTop = 12
  const padBottom = 32

  const chartW = width - padLeft - padRight
  const chartH = H - padTop - padBottom
  const n = readings.length

  const allVals = readings.flatMap(r => [r.systolic, r.diastolic])
  const minVal = Math.min(...allVals) - 4
  const maxVal = Math.max(...allVals) + 4
  const range = maxVal - minVal || 1

  function yPos(val) {
    return padTop + chartH - ((val - minVal) / range) * chartH
  }

  function xPos(i) {
    if (n === 1) return padLeft + chartW / 2
    return padLeft + (i / (n - 1)) * chartW
  }

  const sysPath = smoothCubicPath(readings.map((r, i) => [xPos(i), yPos(r.systolic)]))
  const diaPath = smoothCubicPath(readings.map((r, i) => [xPos(i), yPos(r.diastolic)]))

  const sysMidY = yPos(readings.reduce((s, r) => s + r.systolic, 0) / n)
  const diaMidY = yPos(readings.reduce((s, r) => s + r.diastolic, 0) / n)

  function handleMouseMove(e) {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    let closest = null, bestDist = Infinity
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xPos(i) - mx)
      if (dist < bestDist) { bestDist = dist; closest = i }
    }
    setHovered(closest !== null && bestDist < 40 ? closest : null)
  }

  const hoveredReading = hovered != null ? readings[hovered] : null

  return (
    <div
      className="sparkline-wrap"
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(null)}
      style={{ cursor: 'crosshair' }}
    >
      <svg
        className="sparkline-svg"
        viewBox={`0 0 ${width} ${H}`}
        preserveAspectRatio="none"
        aria-label="7-day blood pressure trend showing systolic and diastolic readings in mmHg"
      >
        {/* Systolic line */}
        <path className="sparkline-path" d={sysPath} style={{ stroke: 'var(--accent)' }} />
        {/* Diastolic line */}
        <path className="sparkline-path" d={diaPath} style={{ stroke: 'var(--amber)' }} />

        {/* Systolic dots */}
        {readings.map((r, i) => (
          <circle
            key={`sys-${i}`}
            cx={xPos(i)}
            cy={yPos(r.systolic)}
            r={hovered === i ? 5 : 3}
            fill="var(--accent)"
            stroke="var(--bg-card)"
            strokeWidth={1.5}
          />
        ))}

        {/* Diastolic dots */}
        {readings.map((r, i) => (
          <circle
            key={`dia-${i}`}
            cx={xPos(i)}
            cy={yPos(r.diastolic)}
            r={hovered === i ? 5 : 3}
            fill="var(--amber)"
            stroke="var(--bg-card)"
            strokeWidth={1.5}
          />
        ))}

        {/* X-axis labels */}
        {readings.map((r, i) => {
          const period = (r.time_of_day || '').toLowerCase() === 'morning' ? 'AM' : 'PM'
          const [, m, d] = r.date.split('-')
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
          return (
            <text
              key={`lbl-${i}`}
              className="sparkline-day-label"
              x={xPos(i)}
              y={H - 4}
              textAnchor={anchor}
            >
              {`${period} · ${parseInt(m)}/${parseInt(d)}`}
            </text>
          )
        })}
      </svg>

      {hoveredReading && (
        <div
          className="bp-trend-tooltip"
          style={{
            left: Math.min(xPos(hovered) + 12, width - 145),
            top: Math.max(yPos(hoveredReading.systolic) - 44, 4),
          }}
        >
          <span className="bp-trend-tooltip-meta">
            {(hoveredReading.time_of_day || '').toLowerCase() === 'morning' ? 'Morning' : 'Evening'}
            {' · '}{formatBPDate(hoveredReading.date)}
          </span>
          <span className="bp-trend-tooltip-value">
            {hoveredReading.systolic} / {hoveredReading.diastolic}
          </span>
          <span className="bp-trend-tooltip-unit">mmHg</span>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [bp, setBp] = useState({ data: null, loading: true, error: null })
  const [insights, setInsights] = useState({ data: null, loading: true, error: null })
  const [oura, setOura] = useState({ data: null, loading: true, error: null })
  const [activity, setActivity] = useState({ data: null, loading: true, error: null })

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

    api
      .activityYesterday()
      .then(data => setActivity({ data, loading: false, error: null }))
      .catch(err => setActivity({ data: null, loading: false, error: err.message }))
  }, [])

  const today = parseTodayReadings(bp.data)
  const topInsights = extractInsights(insights.data)
  const recovery = parseOura(oura.data)
  const activityStats = parseActivity(activity.data)
  const bpReadings = extractBPReadings(bp.data)

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
              <RecoveryStat
                label="Total Sleep"
                value={formatDeepSleep(recovery.totalMinutes)}
                unit=""
                missing="—"
              />
            </div>
          )}
        </section>

        {/* Card 4 — Yesterday's Activity */}
        <section className="card activity-card">
          <h2 className="card-title">Yesterday's Activity</h2>

          {activity.loading && (
            <div className="recovery-skeleton">
              <div className="loading-skeleton" style={{ height: '3.75rem', marginBottom: '0.5rem' }} />
              <div className="loading-skeleton" style={{ height: '3.75rem' }} />
            </div>
          )}

          {!activity.loading && !activityStats && (
            <p className="card-notice">
              {activity.error
                ? 'No activity data available.'
                : 'No activity data for yesterday.'}
            </p>
          )}

          {activityStats && (
            <div className="activity-stats">
              <RecoveryStat
                label="Activity Score"
                value={activityStats.score}
                unit="/ 100"
                missing="—"
              />
              <RecoveryStat
                label="Steps"
                value={activityStats.steps != null ? activityStats.steps.toLocaleString() : null}
                unit=""
                missing="—"
              />
              <RecoveryStat
                label="Active Calories"
                value={activityStats.calories}
                unit="kcal"
                missing="—"
              />
              <RecoveryStat
                label="Walking Distance"
                value={activityStats.distMiles}
                unit="mi"
                missing="—"
              />
            </div>
          )}
        </section>

        {/* BP trend — spans full grid width */}
        <section className="card sparkline-card">
          <div className="sparkline-card-header">
            <h2 className="card-title">7-Day Blood Pressure</h2>
            <div className="bp-legend-inline">
              <span className="bp-legend-item">
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="var(--accent)" />
                </svg>
                Systolic <span className="bp-legend-hint">(top)</span>
              </span>
              <span className="bp-legend-item">
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="var(--amber)" />
                </svg>
                Diastolic <span className="bp-legend-hint">(bottom)</span>
              </span>
            </div>
          </div>
          {bp.loading ? (
            <div className="loading-skeleton" style={{ height: '6.25rem', marginTop: '0.5rem' }} />
          ) : (
            <BPTrendChart readings={bpReadings} />
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
