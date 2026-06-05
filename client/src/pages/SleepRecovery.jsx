import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import './SleepRecovery.css'

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

// Split an array into runs of consecutive items satisfying predicate.
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

function formatAxisDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function formatTooltipDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// Build a 30-slot date window ending on the most recent available date in trends,
// filling gaps with null so the chart renders honest gaps.
function buildSlots(trends, valueKey) {
  if (!trends || trends.length === 0) return []

  const byDate = new Map(trends.map(r => [r.date, r]))
  const dates = trends.map(r => r.date).sort()
  const last = dates[dates.length - 1]

  const slots = []
  const end = new Date(last + 'T00:00:00')
  for (let offset = 29; offset >= 0; offset--) {
    const d = new Date(end)
    d.setDate(end.getDate() - offset)
    const dateStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-')
    const row = byDate.get(dateStr)
    const value = row?.[valueKey] ?? null
    slots.push({ date: dateStr, value })
  }
  return slots
}

function computeMovingAverage(slots, window = 7) {
  return slots.map((slot, i) => {
    const start = Math.max(0, i - window + 1)
    const values = slots.slice(start, i + 1).map(s => s.value).filter(v => v != null)
    if (values.length === 0) return { date: slot.date, value: null }
    return { date: slot.date, value: values.reduce((s, v) => s + v, 0) / values.length }
  })
}

function computeInsight(maSlots, metricName) {
  const nonNull = maSlots.filter(s => s.value != null)
  if (nonNull.length < 7) return null
  const firstAvg = nonNull.slice(0, 7).reduce((s, v) => s + v.value, 0) / 7
  const lastAvg  = nonNull.slice(-7).reduce((s, v) => s + v.value, 0) / 7
  if (firstAvg === 0) return null
  const pct = ((lastAvg - firstAvg) / firstAvg) * 100
  const abs = Math.abs(pct)
  const rounded = Math.round(abs)
  if (abs > 10) {
    return `${metricName} is ${pct > 0 ? 'up' : 'down'} ${rounded}%.`
  }
  if (abs >= 5) {
    return `${metricName} has slightly ${pct > 0 ? 'increased' : 'decreased'}.`
  }
  return `${metricName} has remained relatively stable.`
}

function TrendChart({ slots, color, unit, label, metricName, minFloor, maxCeil }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(600)
  const [tooltip, setTooltip] = useState(null)

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
    return (
      <div className="sr-chart-empty">No data for the last 30 days.</div>
    )
  }

  const H = 140
  const padLeft = 8
  const padRight = 35
  const padTop = 10
  const padBottom = 28

  const chartW = width - padLeft - padRight
  const chartH = H - padTop - padBottom
  const n = slots.length

  const values = slots.filter(s => s.value != null).map(s => s.value)
  const minVal = Math.min(...values, minFloor ?? Math.min(...values))
  const maxVal = Math.max(...values, maxCeil  ?? Math.max(...values))
  const range = maxVal - minVal || 1

  function yPos(val) {
    return padTop + chartH - ((val - minVal) / range) * chartH
  }

  function xPos(i) {
    return padLeft + (i / (n - 1)) * chartW
  }

  const dataRuns = consecutiveRuns(slots, s => s.value != null)
  const pathSegments = dataRuns.map(({ run, startIndex }) =>
    smoothCubicPath(run.map((s, j) => [xPos(startIndex + j), yPos(s.value)]))
  )

  const maSlots = computeMovingAverage(slots)
  const maRuns = consecutiveRuns(maSlots, s => s.value != null)
  const maPathSegments = maRuns.map(({ run, startIndex }) =>
    smoothCubicPath(run.map((s, j) => [xPos(startIndex + j), yPos(s.value)]))
  )

  const insight = metricName ? computeInsight(maSlots, metricName) : null

  // Show tick labels every ~7 days; suppress a % 7 tick if it falls within
  // 4 slots of the final label to avoid two labels crowding each other.
  const tickIndices = []
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      tickIndices.push(i)
    } else if (i % 7 === 0 && i < n - 4) {
      tickIndices.push(i)
    }
  }

  function handleMouseMove(e) {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    // Find closest slot
    let closest = null
    let bestDist = Infinity
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].value == null) continue
      const dist = Math.abs(xPos(i) - mx)
      if (dist < bestDist) { bestDist = dist; closest = i }
    }
    if (closest !== null && bestDist < 40) {
      setTooltip({ index: closest, x: xPos(closest), y: yPos(slots[closest].value) })
    } else {
      setTooltip(null)
    }
  }

  const tooltipSlot = tooltip != null ? slots[tooltip.index] : null

  return (
    <>
    <div
      className="sr-chart-wrap"
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      <svg
        className="sr-chart-svg"
        viewBox={`0 0 ${width} ${H}`}
        preserveAspectRatio="none"
      >
        {pathSegments.map((d, i) => (
          <path key={i} className="sr-chart-path" d={d} style={{ stroke: color }} />
        ))}

        {maPathSegments.map((d, i) => (
          <path
            key={`ma-${i}`}
            d={d}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />
        ))}

        {slots.map((s, i) =>
          s.value != null ? (
            <circle
              key={s.date}
              cx={xPos(i)}
              cy={yPos(s.value)}
              r={tooltip?.index === i ? 5 : 3}
              fill={color}
              stroke="var(--bg-card)"
              strokeWidth={1.5}
              style={{ transition: 'r 0.1s' }}
            />
          ) : null
        )}

        {tickIndices.map(i => (
          <text
            key={`tick-${i}`}
            className="sr-chart-tick"
            x={xPos(i)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          >
            {formatAxisDate(slots[i].date)}
          </text>
        ))}
      </svg>

      {tooltipSlot && (
        <div
          className="sr-tooltip"
          style={{
            left: Math.min(tooltip.x + 12, width - 130),
            top: Math.max(tooltip.y - 36, 4),
          }}
        >
          <span className="sr-tooltip-date">{formatTooltipDate(tooltipSlot.date)}</span>
          <span className="sr-tooltip-value">
            {unit === 'min'
              ? formatMinutes(tooltipSlot.value)
              : `${tooltipSlot.value}${unit ? ` ${unit}` : ''}`}
          </span>
        </div>
      )}
    </div>
    {insight && <p className="sr-chart-insight">{insight}</p>}
    </>
  )
}

function formatMinutes(minutes) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function correlationStrength(r) {
  if (r === null) return null
  const abs = Math.abs(r)
  if (abs >= 0.6) return 'strong'
  if (abs >= 0.3) return 'moderate'
  if (abs >= 0.1) return 'weak'
  return 'none'
}

export default function SleepRecovery() {
  const [data, setData] = useState({ trends: null, correlation: null, loading: true, error: null })
  const [hrv, setHrv] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    api
      .sleepTrends()
      .then(d => setData({ trends: d.trends, correlation: d.correlation, loading: false, error: null }))
      .catch(err => setData({ trends: null, correlation: null, loading: false, error: err.message }))
    api
      .sleepHrvInsights()
      .then(d => setHrv({ data: d, loading: false, error: null }))
      .catch(err => setHrv({ data: null, loading: false, error: err.message }))
  }, [])

  const { trends, correlation, loading, error } = data

  const hrvSlots       = trends ? buildSlots(trends, 'hrv_average')        : []
  const deepSlots      = trends ? buildSlots(trends, 'deep_sleep_minutes') : []
  const rhrSlots       = trends ? buildSlots(trends, 'resting_heart_rate') : []

  const sysStrength  = correlationStrength(correlation?.r_systolic  ?? null)
  const diasStrength = correlationStrength(correlation?.r_diastolic ?? null)

  return (
    <div className="sr-page">
      <header className="page-header sr-page-header">
        <div>
          <h1 className="page-title">Sleep &amp; Recovery</h1>
          <p className="page-subtitle">30-day trends from Oura — showing data through yesterday.</p>
        </div>
      </header>

      <div className="sr-grid">

        {/* HRV Chart */}
        <section className="sr-card">
          <h2 className="sr-card-title">HRV Average</h2>
          <p className="sr-card-desc">Heart rate variability over the last 30 days</p>
          {loading ? (
            <div className="loading-skeleton sr-skeleton" />
          ) : error ? (
            <p className="sr-empty sr-empty--error">Could not load sleep data.</p>
          ) : (
            <TrendChart
              slots={hrvSlots}
              color="var(--accent)"
              unit="ms"
              label="HRV"
              metricName="HRV Average"
              minFloor={0}
            />
          )}
        </section>

        {/* Deep Sleep Chart */}
        <section className="sr-card">
          <h2 className="sr-card-title">Deep Sleep</h2>
          <p className="sr-card-desc">Minutes of deep sleep over the last 30 days</p>
          {loading ? (
            <div className="loading-skeleton sr-skeleton" />
          ) : error ? (
            <p className="sr-empty sr-empty--error">Could not load sleep data.</p>
          ) : (
            <TrendChart
              slots={deepSlots}
              color="var(--green)"
              unit="min"
              label="Deep sleep"
              metricName="Deep Sleep"
              minFloor={0}
            />
          )}
        </section>

        {/* Resting Heart Rate Chart */}
        <section className="sr-card">
          <h2 className="sr-card-title">Resting Heart Rate</h2>
          <p className="sr-card-desc">Resting HR over the last 30 days</p>
          {loading ? (
            <div className="loading-skeleton sr-skeleton" />
          ) : error ? (
            <p className="sr-empty sr-empty--error">Could not load sleep data.</p>
          ) : (
            <TrendChart
              slots={rhrSlots}
              color="var(--red)"
              unit="bpm"
              label="Resting HR"
              metricName="Resting Heart Rate"
              minFloor={40}
            />
          )}
        </section>

        {/* Recovery vs Next-Day BP Correlation */}
        <section className="sr-card sr-card--correlation">
          <h2 className="sr-card-title">Recovery → Next-Day Blood Pressure</h2>
          <p className="sr-card-desc">
            Correlation between Oura readiness score and next-day BP
            {correlation?.observations > 0 && ` — ${correlation.observations} paired days`}
          </p>

          {loading ? (
            <div className="sr-corr-skeleton">
              <div className="loading-skeleton" style={{ height: '5rem', marginBottom: '0.75rem' }} />
              <div className="loading-skeleton" style={{ height: '3rem' }} />
            </div>
          ) : error ? (
            <p className="sr-empty sr-empty--error">Could not load correlation data.</p>
          ) : (
            <div className="sr-corr-body">
              <div className="sr-corr-stats">
                <CorrelationStat
                  label="Systolic"
                  r={correlation?.r_systolic ?? null}
                  strength={sysStrength}
                  interpretation={correlation?.interpretation_systolic}
                />
                <CorrelationStat
                  label="Diastolic"
                  r={correlation?.r_diastolic ?? null}
                  strength={diasStrength}
                  interpretation={correlation?.interpretation_diastolic}
                />
              </div>
            </div>
          )}
        </section>

        {/* HRV → Next-Day BP */}
        <section className="sr-card sr-card--correlation">
          <h2 className="sr-card-title">HRV → Next-Day Blood Pressure</h2>
          <p className="sr-card-desc">
            How sleep quality flows through HRV to affect next-morning BP
            {hrv.data?.observations > 0 && ` — ${hrv.data.observations} paired days`}
          </p>

          {hrv.loading ? (
            <div className="sr-corr-skeleton">
              <div className="loading-skeleton" style={{ height: '5rem', marginBottom: '0.75rem' }} />
              <div className="loading-skeleton" style={{ height: '3rem' }} />
            </div>
          ) : hrv.error ? (
            <p className="sr-empty sr-empty--error">Could not load HRV correlation data.</p>
          ) : (
            <div className="sr-corr-body">
              <div className="sr-hrv-rows">
                <HrvInsightRow
                  label="DEEP SLEEP → HRV"
                  r={hrv.data?.deep_hrv?.r ?? null}
                  n={hrv.data?.deep_hrv?.n ?? 0}
                  text={
                    hrv.data?.deep_hrv?.r != null
                      ? `More deep sleep ${hrv.data.deep_hrv.r > 0 ? 'is' : 'is not'} associated with higher next-morning HRV (r = ${hrv.data.deep_hrv.r > 0 ? '+' : ''}${hrv.data.deep_hrv.r.toFixed(3)}, ${hrv.data.deep_hrv.n} paired days).`
                      : 'Not enough data yet (fewer than 7 paired days).'
                  }
                />
                <HrvInsightRow
                  label="HRV → DIASTOLIC"
                  r={hrv.data?.hrv_bp?.r_diastolic ?? null}
                  n={hrv.data?.hrv_bp?.n ?? 0}
                  secondaryR={hrv.data?.hrv_bp?.r_systolic ?? null}
                  text={
                    hrv.data?.hrv_bp?.r_diastolic != null
                      ? `Higher HRV ${hrv.data.hrv_bp.r_diastolic < 0 ? 'is' : 'is not'} associated with lower next-morning diastolic BP.${hrv.data.hrv_bp.r_systolic != null ? ` (SYS r = ${hrv.data.hrv_bp.r_systolic > 0 ? '+' : ''}${hrv.data.hrv_bp.r_systolic.toFixed(3)})` : ''}`
                      : 'Not enough data yet (fewer than 7 paired days).'
                  }
                />
                <HrvInsightRow
                  label="THE CHAIN"
                  r={null}
                  n={hrv.data?.deep_bp?.n ?? 0}
                  text={
                    hrv.data?.chain?.median_deep != null &&
                    hrv.data?.chain?.high_deep_dia != null &&
                    hrv.data?.chain?.low_deep_dia != null
                      ? `On nights with above-average deep sleep (above ${hrv.data.chain.median_deep} min), your next-morning diastolic averaged ${hrv.data.chain.high_deep_dia} mmHg. On nights with below-average deep sleep, it averaged ${hrv.data.chain.low_deep_dia} mmHg — a ${Math.abs(Math.round((hrv.data.chain.high_deep_dia - hrv.data.chain.low_deep_dia) * 10) / 10)} mmHg difference.`
                      : 'Not enough data yet (fewer than 7 paired days).'
                  }
                />
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}

function HrvInsightRow({ label, r, n, text, secondaryR }) {
  const strength = correlationStrength(r)
  const strengthClass = strength === 'strong'
    ? 'sr-r--strong'
    : strength === 'moderate'
    ? 'sr-r--moderate'
    : strength === 'weak'
    ? 'sr-r--weak'
    : 'sr-r--none'

  return (
    <div className="sr-corr-stat">
      <div className="sr-corr-stat-header">
        <span className="sr-corr-stat-label">{label}</span>
        {r !== null && (
          <span className={`sr-r-badge ${strengthClass}`}>
            r = {r > 0 ? '+' : ''}{r.toFixed(3)}
          </span>
        )}
      </div>
      <p className="sr-corr-interp">{text}</p>
    </div>
  )
}

function CorrelationStat({ label, r, strength, interpretation }) {
  const strengthClass = strength === 'strong'
    ? 'sr-r--strong'
    : strength === 'moderate'
    ? 'sr-r--moderate'
    : strength === 'weak'
    ? 'sr-r--weak'
    : 'sr-r--none'

  return (
    <div className="sr-corr-stat">
      <div className="sr-corr-stat-header">
        <span className="sr-corr-stat-label">{label}</span>
        {r !== null ? (
          <span className={`sr-r-badge ${strengthClass}`}>
            r = {r > 0 ? '+' : ''}{r.toFixed(3)}
          </span>
        ) : (
          <span className="sr-r-badge sr-r--none">—</span>
        )}
      </div>
      {r !== null && strength !== 'none' && (
        <div className="sr-corr-bar-track">
          <div
            className={`sr-corr-bar ${r < 0 ? 'sr-corr-bar--negative' : 'sr-corr-bar--positive'}`}
            style={{ width: `${Math.round(Math.abs(r) * 100)}%` }}
          />
        </div>
      )}
      <p className="sr-corr-interp">{interpretation}</p>
    </div>
  )
}
