import { Component, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { api } from '../api/client'
import './Insights.css'

// ── Date helpers ──────────────────────────────────────────────

function formatTooltipDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

// ── Value formatters ──────────────────────────────────────────

function fmtX(v, unit) {
  if (v == null) return '—'
  if (unit === 'min') {
    const h = Math.floor(v / 60), m = Math.round(v % 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }
  if (unit === ':1') return v.toFixed(2) + ':1'
  if (unit === 'mg') return `${Math.round(v)} mg`
  if (unit === 'kcal') return `${Math.round(v)} kcal`
  return `${Math.round(v)}${unit ? ' ' + unit : ''}`
}

function fmtR(r) {
  if (r == null) return '—'
  return (r > 0 ? '+' : '') + r.toFixed(2)
}

// ── ScatterChart ───────────────────────────────────────────────

function ScatterChart({ data, xLabel, xUnit, rDiastolic, rSystolic }) {
  const unit = xUnit
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(360)
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

  const MIN_DAYS = 7

  if (!data || data.length < MIN_DAYS) {
    return (
      <div className="ins-scatter-empty">
        Not enough data yet ({data?.length ?? 0}/{MIN_DAYS} days)
      </div>
    )
  }

  const H = 180
  const padL = 36, padR = 12, padT = 10, padB = 28
  const chartW = width - padL - padR
  const chartH = H - padT - padB

  const xs   = data.map(p => p.x)
  const dias  = data.map(p => p.dia)
  const syss  = data.map(p => p.sys)

  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const allY = [...dias, ...syss]
  const yRaw  = { min: Math.min(...allY), max: Math.max(...allY) }
  const yPad  = Math.max((yRaw.max - yRaw.min) * 0.1, 3)
  const yMin  = yRaw.min - yPad, yMax = yRaw.max + yPad
  const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1

  function xp(v) { return padL + ((v - xMin) / xRange) * chartW }
  function yp(v) { return padT + chartH - ((v - yMin) / yRange) * chartH }
  function clampY(v) { return Math.max(yMin, Math.min(yMax, v)) }

  // Regression line for diastolic
  const n = data.length
  const sumX  = xs.reduce((s, v) => s + v, 0)
  const sumY  = dias.reduce((s, v) => s + v, 0)
  const sumXY = xs.reduce((s, v, i) => s + v * dias[i], 0)
  const sumX2 = xs.reduce((s, v) => s + v * v, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const regY1 = clampY(slope * xMin + intercept)
  const regY2 = clampY(slope * xMax + intercept)

  // Y axis ticks — ~4 ticks spaced at 5 or 10 mmHg
  const step = (yMax - yMin) > 30 ? 10 : 5
  const yTickStart = Math.ceil(yMin / step) * step
  const yTicks = []
  for (let t = yTickStart; t <= yMax; t += step) yTicks.push(t)

  // X axis ticks — 4 evenly spaced
  const xTicks = [xMin, xMin + xRange / 3, xMin + (2 * xRange) / 3, xMax]

  function handleMouseMove(e) {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best = null, bestDist = Infinity
    data.forEach((p, i) => {
      const dist = Math.hypot(xp(p.x) - mx, yp(p.dia) - my)
      if (dist < bestDist) { bestDist = dist; best = i }
    })
    if (best !== null && bestDist < 32) {
      setTooltip({ i: best, px: xp(data[best].x), py: yp(data[best].dia) })
    } else {
      setTooltip(null)
    }
  }

  const tp = tooltip != null ? data[tooltip.i] : null

  const regColor = rDiastolic == null ? 'var(--text-muted)'
    : rDiastolic < 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div
      className="ins-scatter-wrap"
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      <svg
        className="ins-scatter-svg"
        viewBox={`0 0 ${width} ${H}`}
        preserveAspectRatio="none"
      >
        {/* Y grid lines + labels */}
        {yTicks.map(t => (
          <g key={t}>
            <line
              x1={padL} y1={yp(t)} x2={padL + chartW} y2={yp(t)}
              stroke="var(--border-subtle)" strokeWidth={1}
            />
            <text className="ins-chart-tick" x={padL - 4} y={yp(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {/* X axis ticks */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            className="ins-chart-tick"
            x={xp(t)}
            y={H - 4}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {unit === ':1' ? t.toFixed(1) : Math.round(t)}
          </text>
        ))}

        {/* Regression line */}
        <line
          x1={xp(xMin)} y1={yp(regY1)} x2={xp(xMax)} y2={yp(regY2)}
          stroke={regColor}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          opacity={0.45}
        />

        {/* Systolic dots (secondary, muted) */}
        {data.map((p, i) => (
          <circle
            key={`sys-${i}`}
            cx={xp(p.x)} cy={yp(p.sys)} r={3}
            fill="var(--text-secondary)"
            opacity={tooltip?.i === i ? 0.7 : 0.3}
          />
        ))}

        {/* Diastolic dots (primary) */}
        {data.map((p, i) => (
          <circle
            key={`dia-${i}`}
            cx={xp(p.x)} cy={yp(p.dia)}
            r={tooltip?.i === i ? 5.5 : 3.5}
            fill="var(--accent)"
            stroke="var(--bg-card)"
            strokeWidth={1.5}
            style={{ transition: 'r 0.1s' }}
          />
        ))}
      </svg>

      {tp && (
        <div
          className="ins-tooltip"
          style={{
            left: Math.min(tooltip.px + 12, width - 152),
            top: Math.max(tooltip.py - 52, 4),
          }}
        >
          <span className="ins-tooltip-date">{formatTooltipDate(tp.date)}</span>
          <span className="ins-tooltip-x">{xLabel}: {fmtX(tp.x, xUnit)}</span>
          <span className="ins-tooltip-dia">DIA: {tp.dia} mmHg</span>
          <span className="ins-tooltip-sys">SYS: {tp.sys} mmHg</span>
        </div>
      )}
    </div>
  )
}

// ── ScatterCard ───────────────────────────────────────────────

function scatterSummary(xLabel, rDiastolic, rSystolic, n) {
  if (n < 7 || rDiastolic == null) return null
  const abs = Math.abs(rDiastolic)
  let main
  if (abs < 0.05) {
    main = `No meaningful association found between ${xLabel.toLowerCase()} and next-morning diastolic yet (${n} days).`
  } else {
    const strength = abs >= 0.30 ? 'strongly associated'
      : abs >= 0.15 ? 'moderately associated'
      : 'weakly associated'
    const dir = rDiastolic < 0 ? 'lower' : 'higher'
    main = `Higher ${xLabel.toLowerCase()} is ${strength} with ${dir} next-morning diastolic (DIA r = ${fmtR(rDiastolic)}, ${n} days).`
  }
  let note = null
  if (rSystolic != null && Math.abs(rSystolic) >= 0.20 && Math.sign(rSystolic) !== Math.sign(rDiastolic)) {
    note = `Note: systolic shows the opposite pattern (SYS r = ${fmtR(rSystolic)}).`
  }
  return { main, note }
}

function ScatterCard({ title, data, xLabel, xUnit, rDiastolic, rSystolic }) {
  const n = data?.length ?? 0
  const MIN_DAYS = 7

  const rColor = rDiastolic == null ? 'ins-r--none'
    : Math.abs(rDiastolic) >= 0.4 ? 'ins-r--strong'
    : Math.abs(rDiastolic) >= 0.2 ? 'ins-r--moderate'
    : 'ins-r--weak'

  const summary = scatterSummary(xLabel, rDiastolic, rSystolic, n)

  return (
    <section className="ins-chart-card">
      <div className="ins-chart-card-header">
        <div>
          <h3 className="ins-chart-title">
          {title}
          {title === 'Sodium:Potassium Ratio' && <InfoTooltip />}
        </h3>
          <p className="ins-chart-meta">
            {n >= MIN_DAYS
              ? `${n} paired days`
              : `${n}/${MIN_DAYS} days — keep logging`}
          </p>
        </div>
        <div className="ins-chart-r-col">
          <span className={`ins-r-badge ${n >= MIN_DAYS ? rColor : 'ins-r--none'}`}>
            DIA {fmtR(n >= MIN_DAYS ? rDiastolic : null)}
          </span>
          <span className="ins-r-secondary">
            SYS {fmtR(n >= MIN_DAYS ? rSystolic : null)}
          </span>
        </div>
      </div>
      <ScatterChart
        data={data}
        xLabel={xLabel}
        xUnit={xUnit}
        rDiastolic={rDiastolic}
        rSystolic={rSystolic}
      />
      {summary && (
        <p className="ins-scatter-summary">
          {summary.main}
          {summary.note && <> {summary.note}</>}
        </p>
      )}
    </section>
  )
}

// ── Na:K Ratio Info Tooltip ───────────────────────────────────

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

// ── CorrelationCard ───────────────────────────────────────────

function CorrelationCard({ corr, insightText }) {
  const { variable, unit, r_diastolic, r_systolic, n } = corr
  const MIN_DAYS = 7
  const hasData = n >= MIN_DAYS && r_diastolic != null

  const absR = r_diastolic != null ? Math.abs(r_diastolic) : 0
  const barColor = !hasData ? 'var(--border-subtle)'
    : r_diastolic < -0.05 ? 'var(--green)'
    : r_diastolic >  0.05 ? 'var(--red)'
    : 'var(--text-muted)'

  const rClass = !hasData ? 'ins-r--none'
    : absR >= 0.4 ? 'ins-r--strong'
    : absR >= 0.2 ? 'ins-r--moderate'
    : 'ins-r--weak'

  const dotClass = !hasData || absR < 0.15 ? 'ins-dot--gray'
    : absR >= 0.30 ? 'ins-dot--green'
    : 'ins-dot--amber'

  let direction = ''
  if (hasData) {
    if (Math.abs(r_diastolic) < 0.05) {
      direction = 'No meaningful association detected'
    } else {
      const effect = r_diastolic < 0 ? 'Lower' : 'Higher'
      direction = `Higher ${variable} → ${effect} diastolic BP`
    }
  }

  return (
    <div className={`ins-corr-card${hasData ? '' : ' ins-corr-card--dim'}`}>
      <div className="ins-corr-card-top">
        <div className="ins-corr-var">
          {variable}
          {variable === 'Sodium:Potassium Ratio' && <InfoTooltip />}
        </div>
        <span className={`ins-traffic-dot ${dotClass}`} />
      </div>

      {hasData ? (
        <>
          <div className="ins-corr-r-row">
            <span className={`ins-r-badge ins-r-badge--lg ${rClass}`}>
              DIA r = {fmtR(r_diastolic)}
            </span>
            <span className="ins-corr-sys-r">SYS r = {fmtR(r_systolic)}</span>
          </div>

          <div className="ins-corr-bar-track">
            <div
              className="ins-corr-bar"
              style={{ width: `${Math.round(absR * 100)}%`, background: barColor }}
            />
          </div>

          <p className="ins-corr-direction">{direction}</p>
          <p className="ins-corr-n">{n} paired days</p>
          {insightText && <p className="ins-corr-insight">{insightText}</p>}
        </>
      ) : (
        <p className="ins-corr-no-data">
          Not enough data yet ({n}/{MIN_DAYS} days logged)
        </p>
      )}
    </div>
  )
}

// ── MealSodiumCard ────────────────────────────────────────────

function MealSodiumCard({ item }) {
  if (!item) return null

  if (item.below_threshold) {
    const pct = Math.min(((item.paired_days ?? 0) / 7) * 100, 100)
    return (
      <div className="ins-supp-card ins-supp-card--dim">
        <div className="ins-supp-name">{item.meal_type}</div>
        <div className="ins-supp-progress-track">
          <div className="ins-supp-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="ins-supp-meta">{item.paired_days ?? 0}/7 days logged</p>
      </div>
    )
  }

  const diff = item.difference ?? null
  let insight, dotClass
  if (diff !== null && diff >= 3) {
    insight = `On high-sodium ${item.meal_type.toLowerCase()} days, your next-morning diastolic averaged ${Math.round(item.avg_dia_high)} mmHg vs ${Math.round(item.avg_dia_low)} mmHg on lower-sodium days — a ${Math.round(diff)} mmHg difference.`
    dotClass = 'ins-dot--red'
  } else if (diff !== null && diff <= -3) {
    insight = `Surprisingly, high-sodium ${item.meal_type.toLowerCase()} days were associated with lower next-morning diastolic (${Math.abs(Math.round(diff))} mmHg lower). Worth watching as more data accumulates.`
    dotClass = 'ins-dot--green'
  } else {
    insight = `No meaningful difference in next-morning diastolic based on ${item.meal_type.toLowerCase()} sodium levels yet.`
    dotClass = 'ins-dot--gray'
  }

  let formattedDate = null
  if (item.last_high_sodium_date) {
    const [y, m, d] = item.last_high_sodium_date.split('-').map(Number)
    formattedDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  }

  return (
    <div className="ins-supp-card">
      <div className="ins-supp-header">
        <div className="ins-supp-name">{item.meal_type}</div>
        <span className={`ins-traffic-dot ${dotClass}`} />
      </div>
      <div className="ins-supp-cols">
        <div className="ins-supp-col">
          <span className="ins-supp-col-label">
            High sodium days<br />(above {Math.round(item.median_sodium ?? 0)}mg)
          </span>
          <span className="ins-supp-dia">
            {item.avg_dia_high != null ? Math.round(item.avg_dia_high) : '—'}
          </span>
          <span className="ins-supp-sys">
            {item.avg_sys_high != null ? `${Math.round(item.avg_sys_high)} sys` : '—'}
          </span>
        </div>
        <div className="ins-supp-divider" />
        <div className="ins-supp-col">
          <span className="ins-supp-col-label">Lower sodium days</span>
          <span className="ins-supp-dia">
            {item.avg_dia_low != null ? Math.round(item.avg_dia_low) : '—'}
          </span>
          <span className="ins-supp-sys">
            {item.avg_sys_low != null ? `${Math.round(item.avg_sys_low)} sys` : '—'}
          </span>
        </div>
      </div>
      <p className="ins-supp-insight">{insight}</p>
      <p className="ins-supp-meta">
        {formattedDate && (
          <>Last high-sodium {item.meal_type.toLowerCase()}: {formattedDate}. </>
        )}
        {item.top_sodium_item && (
          <>Biggest sodium contributor: {item.top_sodium_item.food_name} ({Math.round(item.top_sodium_item.sodium_mg)}mg)</>
        )}
      </p>
    </div>
  )
}

// ── DataSummary ───────────────────────────────────────────────

function generateSummaryBullets(correlations) {
  const qualifying = correlations
    .filter(c => c.n >= 15 && c.r_diastolic != null && Math.abs(c.r_diastolic) >= 0.20)
    .sort((a, b) => Math.abs(b.r_diastolic) - Math.abs(a.r_diastolic))
    .slice(0, 5)

  if (qualifying.length < 2) return null

  return qualifying.map((c, i) => {
    const abs = Math.abs(c.r_diastolic)
    const str = abs >= 0.40 ? 'strongly associated'
      : abs >= 0.25 ? 'moderately associated'
      : 'weakly associated'
    const dir = c.r_diastolic < 0 ? 'lower' : 'higher'

    if (i === 0) {
      return `${c.variable} shows the strongest signal in your data — higher values are ${str} with ${dir} next-morning diastolic BP.`
    }
    return `Higher ${c.variable} is also ${str} with ${dir} next-morning diastolic BP.`
  })
}

function DataSummary({ correlations }) {
  const bullets = generateSummaryBullets(correlations)

  return (
    <div className="ins-summary-card">
      <p className="ins-summary-heading">What Your Data Is Saying</p>
      {bullets == null ? (
        <p className="ins-summary-empty">
          Keep logging — your summary will appear here once enough data has accumulated across your tracked variables.
        </p>
      ) : (
        <ul className="ins-summary-list">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  )
}

// ── Error boundary ───────────────────────────────────────────

class InsightsErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[InsightsErrorBoundary] render error:', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="ins-error-card">
          Render error: {this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}

// ── SupplementCorrelationCard ─────────────────────────────────

function SupplementCorrelationCard({ supp }) {
  if (!supp) return null

  if (supp.below_threshold) {
    const pct = Math.min(((supp.days_taken ?? 0) / 7) * 100, 100)
    return (
      <div className="ins-supp-card ins-supp-card--dim">
        <div className="ins-supp-name">{supp.name}</div>
        <div className="ins-supp-progress-track">
          <div className="ins-supp-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="ins-supp-meta">{supp.days_taken ?? 0}/7 days logged</p>
      </div>
    )
  }

  const diff = supp.difference ?? null
  let insight, dotClass
  if (diff !== null && diff <= -3) {
    insight = `Taking ${supp.name} is associated with lower next-morning diastolic (${Math.abs(Math.round(diff))} mmHg lower)`
    dotClass = 'ins-dot--green'
  } else if (diff !== null && diff >= 3) {
    insight = `Taking ${supp.name} is associated with higher next-morning diastolic (${Math.round(diff)} mmHg higher)`
    dotClass = 'ins-dot--red'
  } else {
    insight = `No meaningful difference in next-morning diastolic on days you take ${supp.name}`
    dotClass = 'ins-dot--gray'
  }

  const diaTaken = supp.avg_diastolic_taken != null ? Math.round(supp.avg_diastolic_taken) : '—'
  const sysTaken = supp.avg_systolic_taken  != null ? Math.round(supp.avg_systolic_taken)  : '—'
  const diaOff   = supp.avg_diastolic_not_taken != null ? Math.round(supp.avg_diastolic_not_taken) : '—'
  const sysOff   = supp.avg_systolic_not_taken  != null ? `${Math.round(supp.avg_systolic_not_taken)} sys` : '—'

  return (
    <div className="ins-supp-card">
      <div className="ins-supp-header">
        <div className="ins-supp-name">{supp.name}</div>
        <span className={`ins-traffic-dot ${dotClass}`} />
      </div>
      <div className="ins-supp-cols">
        <div className="ins-supp-col">
          <span className="ins-supp-col-label">Days taken</span>
          <span className="ins-supp-dia">{diaTaken}</span>
          <span className="ins-supp-sys">{sysTaken !== '—' ? `${sysTaken} sys` : '—'}</span>
        </div>
        <div className="ins-supp-divider" />
        <div className="ins-supp-col">
          <span className="ins-supp-col-label">Days not taken</span>
          <span className="ins-supp-dia">{diaOff}</span>
          <span className="ins-supp-sys">{sysOff}</span>
        </div>
      </div>
      <p className="ins-supp-insight">{insight}</p>
      <p className="ins-supp-meta">{supp.days_taken} days taken</p>
    </div>
  )
}

// ── ComingSoonCard ────────────────────────────────────────────

function ComingSoonCard({ title, desc, current, threshold = 7 }) {
  const pct = Math.min((current / threshold) * 100, 100)

  return (
    <div className="ins-coming-card">
      <div className="ins-coming-label">Coming soon</div>
      <div className="ins-coming-title">{title}</div>
      <p className="ins-coming-desc">{desc}</p>
      <div className="ins-coming-progress-track">
        <div className="ins-coming-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="ins-coming-count">{current}/{threshold} days logged</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function Insights() {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    api.insightsFull()
      .then(data => {
        setState({ loading: false, error: null, data })
      })
      .catch(err => setState({ loading: false, error: err?.message || 'Failed to load insights', data: null }))
  }, [])

  const { loading, error, data } = state

  if (loading) return <InsightsLoading />
  if (error)   return <InsightsError message={error} />
  if (!data)   return <InsightsError message="No data received" />

  const {
    correlations,
    mealSodiumCorrelation,
    scatterData,
    thresholds,
    hydrationInsight,
    supplementCorrelations,
  } = data
  const suppList       = Array.isArray(supplementCorrelations) ? supplementCorrelations : []
  const mealSodiumList = Array.isArray(mealSodiumCorrelation)  ? mealSodiumCorrelation  : []

  return (
    <InsightsErrorBoundary>
    <div className="ins-page">
      <header className="page-header ins-page-header">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">
            What your data actually says — correlations between your habits and next-morning blood pressure.
          </p>
        </div>
      </header>

      <DataSummary correlations={correlations} />

      {/* ── Section 1: Top Correlations ── */}
      <section className="ins-section">
        <h2 className="ins-section-title">Top Correlations</h2>
        <p className="ins-section-sub">
          Ranked by strength of association with next-morning diastolic BP. Minimum 7 paired days required.
        </p>
        <div className="ins-traffic-legend">
          <span className="ins-traffic-legend-item">
            <span className="ins-traffic-dot ins-dot--green" /> Meaningful signal (r ≥ 0.30)
          </span>
          <span className="ins-traffic-legend-item">
            <span className="ins-traffic-dot ins-dot--amber" /> Weak signal (r 0.15–0.29)
          </span>
          <span className="ins-traffic-legend-item">
            <span className="ins-traffic-dot ins-dot--gray" /> No clear signal yet
          </span>
          <span className="ins-traffic-legend-item" style={{width: '100%'}}>
            Bar length = correlation strength · Red = raises BP · Green = lowers BP
          </span>
        </div>

        {(() => {
          const ACTIONABLE = new Set([
            'activity score', 'active calories', 'steps', 'step count',
            'daily sodium', 'daily potassium', 'daily magnesium',
            'sodium:potassium ratio', 'hydration', 'daily hydration',
            'daily water intake',
            'top workout duration', 'top workout calories',
          ])
          const OBSERVABLE = new Set([
            'hrv average', 'readiness score', 'deep sleep', 'total sleep',
            'resting heart rate',
          ])
          const actionable = correlations.filter(c => ACTIONABLE.has(c.variable.toLowerCase()))
          const observable = correlations.filter(c => OBSERVABLE.has(c.variable.toLowerCase()))

          return (
            <>
              {actionable.length > 0 && (
                <div className="ins-corr-group">
                  <h3 className="ins-corr-group-title">Things You Can Change</h3>
                  <p className="ins-corr-group-sub">Variables you can directly influence</p>
                  <div className="ins-corr-grid">
                    {actionable.map(corr => {
                      let insightText = null
                      if (corr.variable === 'Daily Water Intake' && hydrationInsight) {
                        const { median_oz, avg_dia_high, avg_dia_low } = hydrationInsight
                        insightText = `On high hydration days (above ${Math.round(median_oz)}oz), your next-morning diastolic averaged ${Math.round(avg_dia_high)} mmHg vs ${Math.round(avg_dia_low)} mmHg on lower hydration days`
                      }
                      return <CorrelationCard key={corr.variable} corr={corr} insightText={insightText} />
                    })}
                  </div>
                </div>
              )}
              {observable.length > 0 && (
                <div className="ins-corr-group">
                  <h3 className="ins-corr-group-title">Things Worth Watching</h3>
                  <p className="ins-corr-group-sub">Metrics you can track but not directly control</p>
                  <div className="ins-corr-grid">
                    {observable.map(corr => <CorrelationCard key={corr.variable} corr={corr} />)}
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </section>

      {/* ── Section 2: Meal Sodium Patterns ── */}
      <section className="ins-section">
        <h2 className="ins-section-title">Meal Sodium Patterns</h2>
        <p className="ins-section-sub">
          High-sodium vs lower-sodium days by meal type — effect on next-morning diastolic.
        </p>
        {mealSodiumList.length === 0 ? (
          <div className="ins-empty-card">
            Keep logging meals — sodium patterns by meal type will appear here once you have more data.
          </div>
        ) : (
          <div className="ins-supp-grid">
            {mealSodiumList.map(item => (
              <MealSodiumCard key={item.meal_type} item={item} />
            ))}
          </div>
        )}
      </section>



      {/* ── Section 3: Minerals vs BP ── */}
      <section className="ins-section">
        <h2 className="ins-section-title">Minerals vs Next-Morning BP</h2>
        <p className="ins-section-sub">
          Each dot = one day. Orange = diastolic (primary), gray = systolic. Dashed line = trend.
        </p>
        <div className="ins-scatter-grid-2">
          <ScatterCard
            title="Daily Sodium"
            data={scatterData.sodium}
            xLabel="Sodium"
            xUnit="mg"
            rDiastolic={correlations.find(c => c.variable === 'Daily Sodium')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Daily Sodium')?.r_systolic}
          />
          <ScatterCard
            title="Daily Potassium"
            data={scatterData.potassium}
            xLabel="Potassium"
            xUnit="mg"
            rDiastolic={correlations.find(c => c.variable === 'Daily Potassium')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Daily Potassium')?.r_systolic}
          />
          <ScatterCard
            title="Daily Magnesium"
            data={scatterData.magnesium}
            xLabel="Magnesium"
            xUnit="mg"
            rDiastolic={correlations.find(c => c.variable === 'Daily Magnesium')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Daily Magnesium')?.r_systolic}
          />
          <ScatterCard
            title="Sodium:Potassium Ratio"
            data={scatterData.nakRatio}
            xLabel="Na:K ratio"
            xUnit=":1"
            rDiastolic={correlations.find(c => c.variable === 'Sodium:Potassium Ratio')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Sodium:Potassium Ratio')?.r_systolic}
          />
        </div>
      </section>

      {/* ── Section 4: Sleep & Recovery vs BP ── */}
      <section className="ins-section">
        <h2 className="ins-section-title">Sleep &amp; Recovery vs Next-Morning BP</h2>
        <p className="ins-section-sub">
          Previous night's sleep metrics vs next-morning diastolic.
        </p>
        <div className="ins-scatter-grid-3">
          <ScatterCard
            title="HRV Average"
            data={scatterData.hrv}
            xLabel="HRV"
            xUnit="ms"
            rDiastolic={correlations.find(c => c.variable === 'HRV Average')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'HRV Average')?.r_systolic}
          />
          <ScatterCard
            title="Deep Sleep"
            data={scatterData.deepSleep}
            xLabel="Deep sleep"
            xUnit="min"
            rDiastolic={correlations.find(c => c.variable === 'Deep Sleep')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Deep Sleep')?.r_systolic}
          />
          <ScatterCard
            title="Readiness Score"
            data={scatterData.readiness}
            xLabel="Readiness"
            xUnit=""
            rDiastolic={correlations.find(c => c.variable === 'Readiness Score')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Readiness Score')?.r_systolic}
          />
        </div>
      </section>

      {/* ── Section 5: Activity vs BP ── */}
      <section className="ins-section">
        <h2 className="ins-section-title">Activity vs Next-Morning BP</h2>
        <p className="ins-section-sub">
          Previous day's activity metrics vs next-morning diastolic.
        </p>
        <div className="ins-scatter-grid-2">
          <ScatterCard
            title="Active Calories"
            data={scatterData.activeCalories}
            xLabel="Active cal"
            xUnit="kcal"
            rDiastolic={correlations.find(c => c.variable === 'Active Calories')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Active Calories')?.r_systolic}
          />
          <ScatterCard
            title="Activity Score"
            data={scatterData.activityScore}
            xLabel="Activity score"
            xUnit=""
            rDiastolic={correlations.find(c => c.variable === 'Activity Score')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Activity Score')?.r_systolic}
          />
          <ScatterCard
            title="Top Workout Duration"
            data={scatterData.workoutDuration}
            xLabel="Workout duration"
            xUnit="min"
            rDiastolic={correlations.find(c => c.variable === 'Top Workout Duration')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Top Workout Duration')?.r_systolic}
          />
          <ScatterCard
            title="Top Workout Calories"
            data={scatterData.workoutCalories}
            xLabel="Workout calories"
            xUnit="kcal"
            rDiastolic={correlations.find(c => c.variable === 'Top Workout Calories')?.r_diastolic}
            rSystolic={correlations.find(c => c.variable === 'Top Workout Calories')?.r_systolic}
          />
        </div>
      </section>

      {/* ── Section 6: Supplements vs BP ── */}
      {suppList.length > 0 && (
        <section className="ins-section">
          <h2 className="ins-section-title">Supplements vs Next-Morning BP</h2>
          <p className="ins-section-sub">
            Days you took each supplement vs days you didn't — effect on next-morning diastolic.
          </p>
          <div className="ins-supp-grid">
            {suppList.map(supp => (
              <SupplementCorrelationCard key={supp.supplement_id ?? supp.name} supp={supp} />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 7: Coming Soon ── */}
      {!hydrationInsight && (
        <section className="ins-section">
          <h2 className="ins-section-title">Coming Soon</h2>
          <p className="ins-section-sub">
            More correlations unlock as you log more data.
          </p>
          <div className="ins-coming-grid">
            <ComingSoonCard
              title="Hydration vs BP"
              desc="Daily water intake correlation with next-morning diastolic. Log water daily to unlock."
              current={thresholds?.hydration_days ?? 0}
              threshold={7}
            />
          </div>
        </section>
      )}
    </div>
    </InsightsErrorBoundary>
  )
}

// ── Loading skeleton ──────────────────────────────────────────

function InsightsLoading() {
  return (
    <div className="ins-page">
      <header className="page-header ins-page-header">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">Loading your correlations…</p>
        </div>
      </header>
      <div className="ins-section">
        <div className="ins-skeleton-title loading-skeleton" />
        <div className="ins-corr-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ins-skeleton-card loading-skeleton" />
          ))}
        </div>
      </div>
      <div className="ins-section">
        <div className="ins-skeleton-title loading-skeleton" />
        <div className="ins-scatter-grid-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ins-skeleton-chart loading-skeleton" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────

function InsightsError({ message }) {
  return (
    <div className="ins-page">
      <header className="page-header ins-page-header">
        <div>
          <h1 className="page-title">Insights</h1>
        </div>
      </header>
      <div className="ins-error-card">
        Could not load insights data. {message}
      </div>
    </div>
  )
}
