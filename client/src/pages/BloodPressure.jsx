import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './BloodPressure.css'

function diastolicClass(val) {
  if (val == null) return ''
  if (val < 80) return 'cell--green'
  if (val < 90) return 'cell--amber'
  return 'cell--red'
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getLocalToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Normalize API response (flat or pre-grouped) to flat rows.
function normalizeReadings(data) {
  if (!Array.isArray(data)) return []
  const flat = []
  for (const r of data) {
    if (r.morning || r.evening) {
      if (r.morning) flat.push({ date: r.date, time_of_day: 'morning', systolic: r.morning.systolic, diastolic: r.morning.diastolic })
      if (r.evening) flat.push({ date: r.date, time_of_day: 'evening', systolic: r.evening.systolic, diastolic: r.evening.diastolic })
    } else if (r.systolic != null) {
      flat.push(r)
    }
  }
  return flat
}

// Return readings within [skipDays, skipDays + days) days ago from today.
function filterByDaysAgo(readings, days, skipDays = 0) {
  const todayMs = new Date(getLocalToday() + 'T12:00:00').getTime()
  return readings.filter(r => {
    const date = String(r.date || '').slice(0, 10)
    if (!date) return false
    const diff = Math.round((todayMs - new Date(date + 'T12:00:00').getTime()) / 86400000)
    return diff >= skipDays && diff < skipDays + days
  })
}

function avg(arr) {
  if (!arr.length) return null
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}

function computeStats(readings, prevReadings) {
  if (!readings.length) return null

  const mornings = readings.filter(r => (r.time_of_day || '').toLowerCase() === 'morning')
  const evenings = readings.filter(r => (r.time_of_day || '').toLowerCase() === 'evening')

  const avgSys = avg(readings.map(r => r.systolic).filter(v => v != null))
  const avgDia = avg(readings.map(r => r.diastolic).filter(v => v != null))
  const amSys  = avg(mornings.map(r => r.systolic).filter(v => v != null))
  const amDia  = avg(mornings.map(r => r.diastolic).filter(v => v != null))
  const pmSys  = avg(evenings.map(r => r.systolic).filter(v => v != null))
  const pmDia  = avg(evenings.map(r => r.diastolic).filter(v => v != null))

  const score = r => (r.systolic + r.diastolic) / 2
  const highest = readings.reduce((best, r) => !best || score(r) > score(best) ? r : best, null)
  const lowest  = readings.reduce((best, r) => !best || score(r) < score(best) ? r : best, null)

  const prevSys    = prevReadings.map(r => r.systolic).filter(v => v != null)
  const prevAvgSys = avg(prevSys)
  const trend = avgSys != null && prevAvgSys != null ? avgSys - prevAvgSys : null

  return { avgSys, avgDia, amSys, amDia, pmSys, pmDia, highest, lowest, trend }
}

function groupByDate(readings) {
  if (!Array.isArray(readings)) return []
  const map = new Map()
  readings.forEach(r => {
    const date = String(r.date || '').slice(0, 10)
    if (!date) return
    if (!map.has(date)) map.set(date, { date, morning: null, evening: null })
    const entry = map.get(date)
    const period = (r.time_of_day || r.period || '').toLowerCase()
    if (period === 'morning' && !entry.morning) {
      entry.morning = { systolic: r.systolic, diastolic: r.diastolic }
    } else if (period === 'evening' && !entry.evening) {
      entry.evening = { systolic: r.systolic, diastolic: r.diastolic }
    } else if (!period && !entry.morning) {
      entry.morning = { systolic: r.systolic, diastolic: r.diastolic }
    }
  })
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

const PERIODS = [7, 14, 30]

export default function BloodPressure() {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [period, setPeriod] = useState(14)

  useEffect(() => {
    api
      .bloodPressure()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: null, loading: false, error: err.message }))
  }, [])

  const allFlat     = normalizeReadings(state.data)
  const periodFlat  = filterByDaysAgo(allFlat, period)
  const prevFlat    = filterByDaysAgo(allFlat, period, period)
  const stats       = computeStats(periodFlat, prevFlat)
  const rows        = groupByDate(periodFlat)

  return (
    <div className="bp-page">
      <header className="page-header">
        <h1 className="page-title">Blood Pressure</h1>
      </header>

      {/* ── Shared header row: subtitle + period selector ── */}
      <div className="bp-period-bar">
        <p className="page-subtitle">Last {period} days of readings</p>
        <div className="bp-period-tabs">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`bp-period-tab${period === p ? ' bp-period-tab--active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      <div className="bp-layout">

        {/* ── Left: stat cards ── */}
        <aside className="bp-stats-col">
          {state.loading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="loading-skeleton bp-stat-skel" />
              ))}
            </>
          ) : !stats ? (
            <div className="bp-stat-card">
              <p className="bp-stat-empty">No readings in this period.</p>
            </div>
          ) : (
            <>
              <div className="bp-stat-card">
                <div className="bp-stat-label">Average</div>
                <div className="bp-stat-value">
                  {stats.avgSys ?? '—'} / {stats.avgDia ?? '—'}
                </div>
                <div className="bp-stat-unit">mmHg</div>
                {stats.trend !== null && (
                  <div className="bp-stat-trend">
                    {stats.trend === 0
                      ? `No change vs prior ${period} days`
                      : stats.trend > 0
                      ? `Up ${stats.trend} pts vs prior ${period} days`
                      : `Down ${Math.abs(stats.trend)} pts vs prior ${period} days`}
                  </div>
                )}
              </div>

              <div className="bp-stat-card">
                <div className="bp-stat-label">Morning Avg</div>
                <div className="bp-stat-value">
                  {stats.amSys != null ? `${stats.amSys} / ${stats.amDia}` : '—'}
                </div>
                {stats.amSys != null && <div className="bp-stat-unit">mmHg</div>}
              </div>

              <div className="bp-stat-card">
                <div className="bp-stat-label">Evening Avg</div>
                <div className="bp-stat-value">
                  {stats.pmSys != null ? `${stats.pmSys} / ${stats.pmDia}` : '—'}
                </div>
                {stats.pmSys != null && <div className="bp-stat-unit">mmHg</div>}
              </div>

              <div className="bp-stat-card">
                <div className="bp-stat-label">Highest Reading</div>
                {stats.highest ? (
                  <>
                    <div className={`bp-stat-value ${diastolicClass(stats.highest.diastolic)}`}>
                      {stats.highest.systolic} / {stats.highest.diastolic}
                    </div>
                    <div className="bp-stat-date">{formatDate(stats.highest.date)}</div>
                  </>
                ) : (
                  <div className="bp-stat-value">—</div>
                )}
              </div>

              <div className="bp-stat-card">
                <div className="bp-stat-label">Lowest Reading</div>
                {stats.lowest ? (
                  <>
                    <div className={`bp-stat-value ${diastolicClass(stats.lowest.diastolic)}`}>
                      {stats.lowest.systolic} / {stats.lowest.diastolic}
                    </div>
                    <div className="bp-stat-date">{formatDate(stats.lowest.date)}</div>
                  </>
                ) : (
                  <div className="bp-stat-value">—</div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── Right: table + legend ── */}
        <div className="bp-right-bottom">
          <div className="card bp-table-card">
            {state.loading && (
              <div className="table-skeleton">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="loading-skeleton row-skeleton" />
                ))}
              </div>
            )}

            {!state.loading && state.error && (
              <p className="page-error">Unable to load data. Is the backend running?</p>
            )}

            {!state.loading && !state.error && rows.length === 0 && (
              <p className="page-empty">No readings in this period.</p>
            )}

            {!state.loading && rows.length > 0 && (
              <>
                {/* Desktop table */}
                <table className="bp-table bp-table--desktop">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Morning</th>
                      <th>Evening</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.date}>
                        <td className="date-cell">{formatDate(row.date)}</td>
                        <td className={diastolicClass(row.morning?.diastolic)}>
                          {row.morning ? (
                            `${row.morning.systolic}/${row.morning.diastolic}`
                          ) : (
                            <span className="no-reading">—</span>
                          )}
                        </td>
                        <td className={diastolicClass(row.evening?.diastolic)}>
                          {row.evening ? (
                            `${row.evening.systolic}/${row.evening.diastolic}`
                          ) : (
                            <span className="no-reading">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile flat list */}
                <ul className="bp-list bp-list--mobile">
                  {rows.flatMap(row => {
                    const items = []
                    if (row.morning) {
                      items.push(
                        <li key={`${row.date}-m`} className="bp-list-row">
                          <span className="bp-list-date">{formatDate(row.date)}</span>
                          <span className="bp-list-period bp-list-period--morning">AM</span>
                          <span className={`bp-list-value ${diastolicClass(row.morning.diastolic)}`}>
                            {row.morning.systolic}/{row.morning.diastolic}
                          </span>
                        </li>
                      )
                    }
                    if (row.evening) {
                      items.push(
                        <li key={`${row.date}-e`} className="bp-list-row">
                          <span className="bp-list-date">{formatDate(row.date)}</span>
                          <span className="bp-list-period bp-list-period--evening">PM</span>
                          <span className={`bp-list-value ${diastolicClass(row.evening.diastolic)}`}>
                            {row.evening.systolic}/{row.evening.diastolic}
                          </span>
                        </li>
                      )
                    }
                    if (items.length === 0) {
                      items.push(
                        <li key={`${row.date}-empty`} className="bp-list-row">
                          <span className="bp-list-date">{formatDate(row.date)}</span>
                          <span className="bp-list-no-data">No readings</span>
                        </li>
                      )
                    }
                    return items
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="bp-legend">
            <span className="legend-item">
              <span className="legend-dot legend-dot--green" />
              Under 80
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--amber" />
              80–89
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot--red" />
              90+
            </span>
            <span className="legend-note">Diastolic, mmHg</span>
          </div>
        </div>

      </div>
    </div>
  )
}
