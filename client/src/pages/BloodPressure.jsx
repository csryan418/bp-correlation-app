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
  // Add noon time to avoid timezone boundary shifts
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function groupByDate(readings) {
  if (!Array.isArray(readings)) return []

  const map = new Map()
  readings.forEach(r => {
    const date = String(r.date || r.recorded_at || r.timestamp || '').slice(0, 10)
    if (!date) return
    if (!map.has(date)) map.set(date, { date, morning: null, evening: null })
    const entry = map.get(date)

    // Pre-grouped shape
    if (r.morning) entry.morning = r.morning
    if (r.evening) entry.evening = r.evening

    // Flat shape
    const period = (r.time_of_day || r.period || '').toLowerCase()
    if (period === 'morning' && !entry.morning) {
      entry.morning = { systolic: r.systolic, diastolic: r.diastolic }
    } else if (period === 'evening' && !entry.evening) {
      entry.evening = { systolic: r.systolic, diastolic: r.diastolic }
    } else if (!period && !entry.morning) {
      entry.morning = { systolic: r.systolic, diastolic: r.diastolic }
    }
  })

  return [...map.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
}

export default function BloodPressure() {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    api
      .bloodPressure()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => setState({ data: null, loading: false, error: err.message }))
  }, [])

  const rows = groupByDate(state.data)

  return (
    <div className="bp-page">
      <header className="page-header">
        <h1 className="page-title">Blood Pressure</h1>
        <p className="page-subtitle">Last 14 days of readings</p>
      </header>

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
          <p className="page-empty">
            No readings found. Start logging to see data here.
          </p>
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
  )
}
