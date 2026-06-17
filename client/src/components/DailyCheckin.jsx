import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './DailyCheckin.css'

export default function DailyCheckin() {
  const [visible, setVisible] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [answers, setAnswers] = useState({
    eight_sleep: null,
    stress_level: null,
    energy_level: null,
  })

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 20) return

    api.getCheckinToday()
      .then(() => {
        // already completed today — don't show
      })
      .catch(() => {
        // 404 = not done yet
        setVisible(true)
      })
  }, [])

  function dismiss() {
    setVisible(false)
  }

  async function submit() {
    try {
      await api.saveCheckin(answers)
      setSubmitted(true)
      setTimeout(() => setVisible(false), 1400)
    } catch (err) {
      console.error('Check-in save failed', err)
    }
  }

  function setAnswer(key, value) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  if (!visible) return null

  return (
    <div className="ci-overlay" onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}>
      <div className="ci-modal" role="dialog" aria-modal="true" aria-label="Daily Check-in">
        <button className="ci-close" onClick={dismiss} aria-label="Dismiss">✕</button>

        {submitted ? (
          <div className="ci-done">
            <span className="ci-done-icon">✓</span>
            <span>Saved</span>
          </div>
        ) : (
          <>
            <div className="ci-header">
              <h2 className="ci-title">Daily Check-in</h2>
              <p className="ci-subtitle">Takes 30 seconds. Helps the correlation engine.</p>
            </div>

            <div className="ci-questions">
              {/* Q1 — Eight Sleep */}
              <div className="ci-question">
                <label className="ci-label">Did you sleep on Eight Sleep last night?</label>
                <div className="ci-toggle-group">
                  {['Yes', 'No', 'Skip'].map((opt) => {
                    const val = opt === 'Skip' ? null : opt === 'Yes' ? 1 : 0
                    const active = opt === 'Skip'
                      ? answers.eight_sleep === null && answers._eight_sleep_touched
                      : answers.eight_sleep === val
                    return (
                      <button
                        key={opt}
                        className={`ci-toggle${active ? ' ci-toggle--active' : ''}`}
                        onClick={() => {
                          if (opt === 'Skip') {
                            setAnswers(prev => ({ ...prev, eight_sleep: null, _eight_sleep_touched: true }))
                          } else {
                            setAnswer('eight_sleep', val)
                            setAnswers(prev => ({ ...prev, eight_sleep: val, _eight_sleep_touched: false }))
                          }
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Q2 — Stress level */}
              <div className="ci-question">
                <label className="ci-label">Stress level today</label>
                <div className="ci-scale-wrap">
                  <span className="ci-scale-label">Low</span>
                  <div className="ci-scale">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        className={`ci-scale-btn${answers.stress_level === n ? ' ci-scale-btn--active' : ''}`}
                        onClick={() => setAnswer('stress_level', n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="ci-scale-label">High</span>
                </div>
                <button
                  className={`ci-skip-link${answers.stress_level === null && answers._stress_touched ? ' ci-skip-link--active' : ''}`}
                  onClick={() => setAnswers(prev => ({ ...prev, stress_level: null, _stress_touched: true }))}
                >
                  Skip
                </button>
              </div>

              {/* Q3 — Energy level */}
              <div className="ci-question">
                <label className="ci-label">Energy level today</label>
                <div className="ci-scale-wrap">
                  <span className="ci-scale-label">Low</span>
                  <div className="ci-scale">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        className={`ci-scale-btn${answers.energy_level === n ? ' ci-scale-btn--active' : ''}`}
                        onClick={() => setAnswer('energy_level', n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="ci-scale-label">High</span>
                </div>
                <button
                  className={`ci-skip-link${answers.energy_level === null && answers._energy_touched ? ' ci-skip-link--active' : ''}`}
                  onClick={() => setAnswers(prev => ({ ...prev, energy_level: null, _energy_touched: true }))}
                >
                  Skip
                </button>
              </div>
            </div>

            <button className="ci-submit" onClick={submit}>
              Save check-in
            </button>
          </>
        )}
      </div>
    </div>
  )
}
