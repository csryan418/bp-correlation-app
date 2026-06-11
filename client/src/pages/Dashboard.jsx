import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './Dashboard.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning, Caroline.'
  if (h < 17) return 'Good afternoon, Caroline.'
  return 'Good evening, Caroline.'
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

function extractLast5Days(data) {
  if (!Array.isArray(data)) return []
  const map = {}
  for (const r of data) {
    const date = String(r.date ?? '').slice(0, 10)
    if (!date) continue
    if (!map[date]) map[date] = { date, morning: null, evening: null }
    if (r.morning != null || r.evening != null) {
      if (r.morning) map[date].morning = r.morning
      if (r.evening) map[date].evening = r.evening
      continue
    }
    if (r.systolic == null || r.diastolic == null) continue
    const tod = (r.time_of_day ?? r.period ?? '').toLowerCase()
    const reading = { systolic: r.systolic, diastolic: r.diastolic }
    if (tod === 'morning') map[date].morning = reading
    else if (tod === 'evening') map[date].evening = reading
  }
  return Object.values(map)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
}

function formatBPHistoryDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// Top 2 correlations from the insightsFull response, already ranked by |r_diastolic|
function extractInsights(data) {
  const list = Array.isArray(data?.correlations) ? data.correlations : []
  return list
    .filter(c => c != null && c.r_diastolic != null && c.n >= 7)
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
  const padLeft = 6
  const padRight = 6
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

        {/* X-axis labels — one per calendar date, at the first reading for that date */}
        {readings.map((r, i) => {
          if (i > 0 && readings[i - 1].date === r.date) return null
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
              {`${parseInt(m)}/${parseInt(d)}`}
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
  const [workout, setWorkout] = useState(null)

  useEffect(() => {
    function loadData() {
      api
        .bloodPressure()
        .then(data => setBp({ data, loading: false, error: null }))
        .catch(err => setBp({ data: null, loading: false, error: err.message }))

      api
        .insightsFull()
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

      api
        .workoutYesterday()
        .then(data => setWorkout(data))
        .catch(() => setWorkout(null))
    }

    loadData()
    window.addEventListener('bp:sync-complete', loadData)
    return () => window.removeEventListener('bp:sync-complete', loadData)
  }, [])

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
          <h2 className="card-title">Recent Blood Pressure</h2>
          {!bp.loading && bp.error && (
            <p className="card-notice card-notice--error">Could not load readings</p>
          )}
          <BPHistoryList data={bp.data} loading={bp.loading} />
        </section>

        {/* Card 2 — Insights */}
        <section className="card insights-card">
          <h2 className="card-title">Correlation Insights</h2>
          <p className="insights-bar-legend">Bar length = correlation strength · Red = raises BP · Green = lowers BP</p>

          {insights.loading && (
            <div className="insights-skeleton">
              <div className="loading-skeleton" style={{ height: '4.5rem', marginBottom: '0.5rem' }} />
              <div className="loading-skeleton" style={{ height: '4.5rem', marginBottom: '0.5rem' }} />
              <div className="loading-skeleton" style={{ height: '4.5rem' }} />
            </div>
          )}

          {!insights.loading && topInsights.length === 0 && (
            <p className="card-notice">Insights will appear as more data is logged.</p>
          )}

          {topInsights.map((corr, i) => (
            <DashCorrelationRow key={i} corr={corr} />
          ))}

          {!insights.loading && topInsights.length > 0 && (
            <Link to="/insights" className="insights-view-all">View all insights →</Link>
          )}
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
                ? 'No Oura data available yet...'
                : 'No recovery data for yesterday yet...'}
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
                ? 'No activity data available yet...'
                : 'No activity data for yesterday yet...'}
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
              <div className="recovery-stat">
                <div className="recovery-stat-value-row">
                  {workout
                    ? <span className="recovery-stat-value">{Math.round(workout.total_duration_minutes)}m</span>
                    : <span className="recovery-stat-missing">—</span>
                  }
                </div>
                <span className="recovery-stat-label">
                  {workout
                    ? `TOTAL TOP WORKOUT: ${workout.workout_type.toUpperCase()}`
                    : 'TOTAL TOP WORKOUT'}
                </span>
              </div>
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

function BPHistoryList({ data, loading }) {
  if (loading) {
    return (
      <div className="bp-history-wrap">
        <div className="loading-skeleton" style={{ flex: 1, borderRadius: '0.375rem', minHeight: '8rem' }} />
      </div>
    )
  }

  const days = extractLast5Days(data)
  const todayStr = localTodayStr()
  const todayEntry = days.find(d => d.date === todayStr) ?? { morning: null, evening: null }
  const reminder = !todayEntry.morning
    ? 'Don\'t forget to log your morning BP'
    : !todayEntry.evening
      ? 'Don\'t forget to log your evening BP'
      : null

  if (!days.length) {
    return (
      <>
        <p className="card-notice">No readings logged yet.</p>
        {reminder && <p className="bp-log-reminder"><span aria-hidden="true">🔔</span>{reminder}</p>}
      </>
    )
  }

  return (
    <div className="bp-history-wrap">
      <div className="bp-history-list">
        <div className="bp-history-header">
          <span className="bp-history-cell bp-history-date-cell" />
          <span className="bp-history-cell bp-history-col-label">Morning</span>
          <span className="bp-history-cell bp-history-col-label">Evening</span>
        </div>
        {days.map(({ date, morning, evening }) => (
          <div key={date} className="bp-history-row">
            <span className="bp-history-cell bp-history-date-cell">
              {formatBPHistoryDate(date)}
            </span>
            <span className={`bp-history-cell bp-history-reading${morning ? ` bp-history-reading--${diastolicStatus(morning.diastolic)}` : ''}`}>
              {morning ? `${morning.systolic}/${morning.diastolic}` : '—'}
            </span>
            <span className={`bp-history-cell bp-history-reading${evening ? ` bp-history-reading--${diastolicStatus(evening.diastolic)}` : ''}`}>
              {evening ? `${evening.systolic}/${evening.diastolic}` : '—'}
            </span>
          </div>
        ))}
      </div>
      {reminder && <p className="bp-log-reminder"><span aria-hidden="true">🔔</span>{reminder}</p>}
      <div className="bp-history-legend">
        <span className="bp-history-legend-item">
          <span className="bp-history-legend-dot bp-history-legend-dot--green" />
          Under 80
        </span>
        <span className="bp-history-legend-item">
          <span className="bp-history-legend-dot bp-history-legend-dot--amber" />
          80–89
        </span>
        <span className="bp-history-legend-item">
          <span className="bp-history-legend-dot bp-history-legend-dot--red" />
          90+
        </span>
        <span className="bp-history-legend-note">Diastolic, mmHg</span>
      </div>
    </div>
  )
}

function InfoTooltip() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const tooltipRef = useRef(null)
  const leaveTimer = useRef(null)

  const show = () => { clearTimeout(leaveTimer.current); setOpen(true) }
  const hide = () => { leaveTimer.current = setTimeout(() => setOpen(false), 150) }

  useEffect(() => {
    if (!open) return
    function close(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) return
    const el = tooltipRef.current
    el.style.left = '0'
    el.style.right = 'auto'
    const { right } = el.getBoundingClientRect()
    const overflow = right - (window.innerWidth - 8)
    if (overflow > 0) {
      el.style.left = `-${overflow}px`
    }
  }, [open])

  return (
    <span className="nak-info-wrap" ref={wrapRef} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className="nak-info-btn"
        aria-label="About the sodium:potassium ratio"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="nak-info-tooltip" ref={tooltipRef} role="tooltip" onMouseEnter={show} onMouseLeave={hide}>
          <p className="nak-info-label">What it is</p>
          <p className="nak-info-body">Your daily sodium intake divided by your daily potassium intake.</p>
          <p className="nak-info-label">Target</p>
          <p className="nak-info-body">Below 1.0 means you're eating more potassium than sodium — the goal. A ratio closer to 1:2 (sodium:potassium) is often cited as ideal.</p>
          <p className="nak-info-label">Why it matters</p>
          <p className="nak-info-body">A high ratio is associated with elevated blood pressure. Most Western diets are well above 1.0.</p>
        </div>
      )}
    </span>
  )
}

function DashCorrelationRow({ corr }) {
  const { variable, r_diastolic, n } = corr
  const absR = Math.abs(r_diastolic)
  const direction = r_diastolic > 0.05 ? 'positive' : r_diastolic < -0.05 ? 'negative' : 'neutral'
  const barColor = direction === 'negative' ? 'var(--green)' : direction === 'positive' ? 'var(--red)' : 'var(--text-muted)'
  const rClass = absR >= 0.4 ? 'insight-r--strong' : absR >= 0.2 ? 'insight-r--moderate' : 'insight-r--weak'
  const rLabel = (r_diastolic > 0 ? '+' : '') + r_diastolic.toFixed(2)

  return (
    <div className="insight-row">
      <div className="insight-header">
        <span className="insight-factor">
          {variable}
          {variable === 'Sodium:Potassium Ratio' && <InfoTooltip />}
        </span>
        {direction !== 'neutral' && (
          <span className={`insight-tag insight-tag--${direction}`}>
            {direction === 'positive' ? '↑ raises BP' : '↓ lowers BP'}
          </span>
        )}
      </div>
      <div className="insight-r-row">
        <span className={`insight-r-badge ${rClass}`}>DIA r = {rLabel}</span>
        <span className="insight-n">{n} paired days</span>
      </div>
      <div className="insight-bar-track">
        <div
          className="insight-bar"
          style={{ width: `${Math.round(absR * 100)}%`, background: barColor }}
        />
      </div>
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
