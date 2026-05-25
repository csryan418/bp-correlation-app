import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import './FoodHydration.css'

const DAILY_GOAL_OZ = 80
const SODIUM_GOAL = 1500
const POTASSIUM_GOAL = 3500
const MAGNESIUM_GOAL = 400

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function calcMineral(base, grams, qty) {
  if (base == null) return null
  return Math.round((base / 100) * grams * qty)
}

function formatLogDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function FoodHydration() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const isToday = selectedDate === today

  function navigateDate(delta) {
    setSelectedDate(prev => {
      const d = new Date(prev + 'T00:00:00')
      d.setDate(d.getDate() + delta)
      const next = d.toISOString().slice(0, 10)
      return next > today ? today : next
    })
  }

  return (
    <div className="fh-page">
      <header className="page-header fh-page-header">
        <div>
          <h1 className="page-title">Food & Hydration</h1>
          <p className="page-subtitle">Log today's food and water intake</p>
        </div>
        <div className="fh-page-date-nav">
          <button className="fh-date-nav-btn" onClick={() => navigateDate(-1)} aria-label="Previous day">‹</button>
          <span className="fh-page-date-text">{isToday ? 'Today' : formatLogDate(selectedDate)}</span>
          <input
            className="fh-date-input text-input"
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
          />
          <button className="fh-date-nav-btn" onClick={() => navigateDate(1)} disabled={isToday} aria-label="Next day">›</button>
        </div>
      </header>
      <FoodSection selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
    </div>
  )
}

function FoodSection({ selectedDate, setSelectedDate }) {
  const today = new Date().toISOString().slice(0, 10)
  const isToday = selectedDate === today

  // Search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Active meal type
  const [activeMealType, setActiveMealType] = useState('Breakfast')

  // Confirm panel — configures item before adding to basket
  const [confirmingItem, setConfirmingItem] = useState(null)
  const [confirmPortionsLoading, setConfirmPortionsLoading] = useState(false)
  const [confirmPortions, setConfirmPortions] = useState([])
  const [confirmBasePer100g, setConfirmBasePer100g] = useState(null)
  const [confirmPortionsFailed, setConfirmPortionsFailed] = useState(false)
  const [confirmPortionIdx, setConfirmPortionIdx] = useState(0)
  const [confirmQuantity, setConfirmQuantity] = useState(1)
  const [confirmGramsInput, setConfirmGramsInput] = useState(100)

  // Basket — items staged for "Log Meal"
  const [basket, setBasket] = useState([])
  const [loggingMeal, setLoggingMeal] = useState(false)

  // Toast & log
  const [toast, setToast] = useState(false)
  const [todayLog, setTodayLog] = useState([])

  // Edit in-place
  const [editingId, setEditingId] = useState(null)
  const [editPortions, setEditPortions] = useState([])
  const [editBasePer100g, setEditBasePer100g] = useState(null)
  const [editPortionsLoading, setEditPortionsLoading] = useState(false)
  const [editPortionIdx, setEditPortionIdx] = useState(0)
  const [editQuantity, setEditQuantity] = useState(1)
  const [editSodium, setEditSodium] = useState('')
  const [editPotassium, setEditPotassium] = useState('')
  const [editMagnesium, setEditMagnesium] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Manual entry
  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualSodium, setManualSodium] = useState('')
  const [manualPotassium, setManualPotassium] = useState('')
  const [manualMagnesium, setManualMagnesium] = useState('')
  const [manualDate, setManualDate] = useState(today)
  const [manualLogging, setManualLogging] = useState(false)

  // Saved meals
  const [savedMeals, setSavedMeals] = useState([])
  const [showCreateMeal, setShowCreateMeal] = useState(false)

  const debounceRef = useRef(null)
  const toastRef = useRef(null)
  const searchGenRef = useRef(0)

  useEffect(() => { fetchSavedMeals() }, [])
  useEffect(() => {
    fetchLog(selectedDate)
    setEditingId(null)
    setShowManual(false)
    setConfirmingItem(null)
    setQuery('')
    setResults([])
    setSearchError(null)
  }, [selectedDate])

  async function fetchLog(date) {
    try {
      const data = await api.getFoodLog(date)
      setTodayLog(Array.isArray(data) ? data : [])
    } catch { }
  }

  async function fetchSavedMeals() {
    try {
      const data = await api.getSavedMeals()
      setSavedMeals(Array.isArray(data) ? data : [])
    } catch { }
  }

  function showToast() {
    clearTimeout(toastRef.current)
    setToast(true)
    toastRef.current = setTimeout(() => setToast(false), 2500)
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchGenRef.current += 1
    setResults([])
    setSearchError(null)
    if (!query.trim()) { setConfirmingItem(null); return }
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function doSearch(term) {
    const gen = searchGenRef.current
    setLoading(true)
    setConfirmingItem(null)
    try {
      const data = await api.searchFood(term)
      if (gen !== searchGenRef.current) return
      const items = Array.isArray(data) ? data.slice(0, 5) : []
      setResults(items)
      if (items.length === 0) setSearchError('empty')
    } catch {
      if (gen !== searchGenRef.current) return
      setSearchError('unavailable')
    } finally {
      if (gen === searchGenRef.current) setLoading(false)
    }
  }

  async function handleSelect(item) {
    setConfirmingItem(item)
    setConfirmQuantity(1)
    setConfirmPortionsFailed(false)
    setConfirmPortions([])
    setConfirmPortionIdx(0)
    setConfirmBasePer100g(null)
    setConfirmPortionsLoading(true)
    try {
      const data = await api.getFoodPortions(item.fdcId)
      const portionList = data.portions ?? []
      setConfirmPortions(portionList)
      setConfirmBasePer100g(data.basePer100g ?? null)
      const defaultIdx = portionList.findIndex(p => p.label !== '100g')
      setConfirmPortionIdx(defaultIdx >= 0 ? defaultIdx : 0)
    } catch {
      setConfirmPortionsFailed(true)
      setConfirmGramsInput(100)
    } finally {
      setConfirmPortionsLoading(false)
    }
  }

  function handleConfirmCancel() {
    setConfirmingItem(null)
    setConfirmPortions([])
    setConfirmBasePer100g(null)
    setConfirmPortionsFailed(false)
    setConfirmQuantity(1)
  }

  function clearQuery() {
    setQuery('')
    setResults([])
    setSearchError(null)
    setConfirmingItem(null)
  }

  // Computed values for confirm panel preview
  const confirmGrams = confirmPortionsFailed
    ? confirmGramsInput
    : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
  const confirmBase = confirmBasePer100g ?? confirmingItem
  const confirmSodium    = confirmingItem ? calcMineral(confirmBase?.sodium_mg,    confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmPotassium = confirmingItem ? calcMineral(confirmBase?.potassium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmMagnesium = confirmingItem ? calcMineral(confirmBase?.magnesium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null

  function handleAddToBasket() {
    if (!confirmingItem) return
    const grams = confirmPortionsFailed ? confirmGramsInput : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
    const base = confirmBasePer100g ?? confirmingItem
    const baseSodium    = confirmPortionsFailed ? confirmingItem.sodium_mg    : base?.sodium_mg
    const basePotassium = confirmPortionsFailed ? confirmingItem.potassium_mg : base?.potassium_mg
    const baseMagnesium = confirmPortionsFailed ? confirmingItem.magnesium_mg : base?.magnesium_mg
    const qty = confirmPortionsFailed ? 1 : confirmQuantity
    const portionLabel = confirmPortionsFailed
      ? `${grams}g`
      : (confirmPortions[confirmPortionIdx]?.label ?? '100g')

    setBasket(prev => [...prev, {
      key: `${confirmingItem.fdcId ?? 'manual'}-${Date.now()}`,
      fdcId: confirmingItem.fdcId ?? null,
      description: confirmingItem.description,
      sodiumPerUnit:    calcMineral(baseSodium,    grams, 1),
      potassiumPerUnit: calcMineral(basePotassium, grams, 1),
      magnesiumPerUnit: calcMineral(baseMagnesium, grams, 1),
      quantity: qty,
      portionLabel,
    }])

    setConfirmingItem(null)
    setConfirmPortions([])
    setConfirmBasePer100g(null)
    setConfirmPortionsFailed(false)
    setConfirmQuantity(1)
    setQuery('')
    setResults([])
    setSearchError(null)
  }

  function updateBasketQty(key, val) {
    setBasket(prev => prev.map(item =>
      item.key === key ? { ...item, quantity: Math.max(0.25, parseFloat(val) || 1) } : item
    ))
  }

  function removeFromBasket(key) {
    setBasket(prev => prev.filter(item => item.key !== key))
  }

  async function handleLogMeal() {
    if (basket.length === 0) return
    setLoggingMeal(true)
    const mealId = Date.now()
    try {
      for (const item of basket) {
        const qty = parseFloat(item.quantity) || 1
        await api.logFood({
          fdcId: item.fdcId,
          description: item.description,
          servings: qty,
          sodium_mg:    item.sodiumPerUnit    != null ? Math.round(item.sodiumPerUnit    * qty) : null,
          potassium_mg: item.potassiumPerUnit != null ? Math.round(item.potassiumPerUnit * qty) : null,
          magnesium_mg: item.magnesiumPerUnit != null ? Math.round(item.magnesiumPerUnit * qty) : null,
          date: today,
          meal_type: activeMealType,
          meal_id: mealId,
        })
      }
      setBasket([])
      showToast()
      fetchLog(selectedDate)
    } catch { } finally {
      setLoggingMeal(false)
    }
  }

  function loadSavedMealIntoBasket(meal) {
    const items = meal.items.map(item => ({
      key: `relog-${item.id}-${Date.now()}`,
      fdcId: item.fdc_id ?? null,
      description: item.food_name,
      sodiumPerUnit:    item.sodium_mg_per_100g    ?? null,
      potassiumPerUnit: item.potassium_mg_per_100g ?? null,
      magnesiumPerUnit: item.magnesium_mg_per_100g ?? null,
      quantity: 1,
      portionLabel: '1 srv',
    }))
    setBasket(items)
  }

  // Edit in-place handlers (unchanged)
  async function openEdit(entry) {
    if (editingId === entry.id) { setEditingId(null); return }
    setEditingId(entry.id)
    setEditPortions([])
    setEditBasePer100g(null)
    setEditPortionIdx(0)
    setEditQuantity(parseFloat(entry.serving_size) || 1)
    setEditSodium(String(Math.round(entry.sodium_mg    || 0)))
    setEditPotassium(String(Math.round(entry.potassium_mg || 0)))
    setEditMagnesium(String(Math.round(entry.magnesium_mg || 0)))
    if (entry.fdc_id) {
      setEditPortionsLoading(true)
      try {
        const data = await api.getFoodPortions(entry.fdc_id)
        const portionList = data.portions ?? []
        setEditPortions(portionList)
        setEditBasePer100g(data.basePer100g ?? null)
        const defaultIdx = portionList.findIndex(p => p.label !== '100g')
        setEditPortionIdx(defaultIdx >= 0 ? defaultIdx : 0)
      } catch { } finally {
        setEditPortionsLoading(false)
      }
    }
  }

  async function handleEditSave(entry) {
    setEditSaving(true)
    try {
      let sodium, potassium, magnesium
      if (editPortions.length > 0 && editBasePer100g) {
        const grams = editPortions[editPortionIdx]?.grams ?? 100
        sodium    = calcMineral(editBasePer100g.sodium_mg,    grams, editQuantity)
        potassium = calcMineral(editBasePer100g.potassium_mg, grams, editQuantity)
        magnesium = calcMineral(editBasePer100g.magnesium_mg, grams, editQuantity)
      } else {
        sodium    = parseFloat(editSodium)    || null
        potassium = parseFloat(editPotassium) || null
        magnesium = parseFloat(editMagnesium) || null
      }
      await api.updateFoodLog(entry.id, { servings: editQuantity, sodium_mg: sodium, potassium_mg: potassium, magnesium_mg: magnesium })
      setEditingId(null)
      fetchLog(selectedDate)
    } catch { } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id) {
    try { await api.deleteFoodLog(id); fetchLog(selectedDate) } catch { }
  }

  async function handleManualLog(e) {
    e.preventDefault()
    if (!manualName.trim()) return
    setManualLogging(true)
    try {
      await api.logFood({
        fdcId: null,
        description: manualName.trim(),
        servings: 1,
        sodium_mg:    parseFloat(manualSodium)    || null,
        potassium_mg: parseFloat(manualPotassium) || null,
        magnesium_mg: parseFloat(manualMagnesium) || null,
        date: manualDate || today,
        meal_type: activeMealType,
        meal_id: Date.now(),
      })
      showToast()
      setShowManual(false)
      setManualName(''); setManualSodium(''); setManualPotassium(''); setManualMagnesium('')
      setManualDate(today)
      fetchLog(selectedDate)
    } catch { } finally {
      setManualLogging(false)
    }
  }

  async function handleDeleteSavedMeal(id) {
    try { await api.deleteSavedMeal(id); fetchSavedMeals() } catch { }
  }

  async function handleCreateSavedMeal(name, items) {
    await api.createSavedMeal(name, items)
    setShowCreateMeal(false)
    fetchSavedMeals()
  }

  // Grouping
  const logByMeal = MEAL_TYPES.reduce((acc, mt) => {
    acc[mt] = todayLog.filter(e => (e.meal_type || '').toLowerCase() === mt.toLowerCase())
    return acc
  }, {})
  const unspecified = todayLog.filter(e =>
    !MEAL_TYPES.map(m => m.toLowerCase()).includes((e.meal_type || '').toLowerCase())
  )

  const sodiumTotal    = todayLog.reduce((s, e) => s + (e.sodium_mg    || 0), 0)
  const potassiumTotal = todayLog.reduce((s, e) => s + (e.potassium_mg || 0), 0)
  const magnesiumTotal = todayLog.reduce((s, e) => s + (e.magnesium_mg || 0), 0)

  // Edit panel computed values
  const editGrams = editPortions[editPortionIdx]?.grams ?? 100
  const editComputedSodium    = editBasePer100g ? calcMineral(editBasePer100g.sodium_mg,    editGrams, editQuantity) : null
  const editComputedPotassium = editBasePer100g ? calcMineral(editBasePer100g.potassium_mg, editGrams, editQuantity) : null
  const editComputedMagnesium = editBasePer100g ? calcMineral(editBasePer100g.magnesium_mg, editGrams, editQuantity) : null

  // Basket totals
  const basketSodium    = basket.reduce((s, i) => s + (i.sodiumPerUnit    != null ? Math.round(i.sodiumPerUnit    * i.quantity) : 0), 0)
  const basketPotassium = basket.reduce((s, i) => s + (i.potassiumPerUnit != null ? Math.round(i.potassiumPerUnit * i.quantity) : 0), 0)
  const basketMagnesium = basket.reduce((s, i) => s + (i.magnesiumPerUnit != null ? Math.round(i.magnesiumPerUnit * i.quantity) : 0), 0)

  const editProps = {
    editingId, editPortionsLoading, editPortions, editBasePer100g,
    editPortionIdx, setEditPortionIdx, editQuantity, setEditQuantity,
    editSodium, setEditSodium, editPotassium, setEditPotassium,
    editMagnesium, setEditMagnesium,
    editComputedSodium, editComputedPotassium, editComputedMagnesium,
    editSaving, onEdit: openEdit, onEditSave: handleEditSave,
    onCancelEdit: () => setEditingId(null), onDelete: handleDelete,
  }

  return (
    <div className="fh-layout">
      <div className="fh-main">

        {/* Daily nutrient summary */}
        <section className="fh-summary-bar">
          <NutrientSummaryItem label="Sodium"    symbol="Na" value={sodiumTotal}    goal={SODIUM_GOAL}    colorVar="var(--red)"   />
          <NutrientSummaryItem label="Potassium" symbol="K"  value={potassiumTotal} goal={POTASSIUM_GOAL} colorVar="var(--green)" />
          <NutrientSummaryItem label="Magnesium" symbol="Mg" value={magnesiumTotal} goal={MAGNESIUM_GOAL} colorVar="var(--amber)" />
        </section>

        {/* Food search + basket */}
        <section className="fh-food-section">

          <div className="fh-meal-tabs">
            {MEAL_TYPES.map(mt => (
              <button
                key={mt}
                className={`fh-meal-tab${activeMealType === mt ? ' fh-meal-tab--active' : ''}`}
                onClick={() => setActiveMealType(mt)}
              >{mt}</button>
            ))}
          </div>

          {isToday ? (
            <>
              <div className="fs-input-wrap">
                {loading && <span className="fs-spinner" />}
                <input
                  className={`text-input fs-input${loading ? ' fs-input--loading' : ''}`}
                  type="text"
                  placeholder="Search foods (e.g. banana, canned soup, Greek yogurt)"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowManual(false) }}
                />
                {query && !loading && (
                  <button className="fs-clear" onClick={clearQuery} aria-label="Clear search">×</button>
                )}
              </div>
              <button className="fs-manual-link" onClick={() => { setShowManual(v => !v); setConfirmingItem(null) }}>
                {showManual ? '↑ Hide manual entry' : '+ Enter manually'}
              </button>
            </>
          ) : (
            <button className="fs-manual-link" onClick={() => { setManualDate(selectedDate); setShowManual(v => !v); setConfirmingItem(null) }}>
              {showManual ? '↑ Hide manual entry' : '+ Add food'}
            </button>
          )}

          {isToday && searchError === 'unavailable' && <p className="inline-error">Food search unavailable</p>}
          {isToday && searchError === 'empty' && <p className="fs-empty">No results — try a more specific name</p>}

          {showManual && (
            <form className="fs-manual-form" onSubmit={handleManualLog}>
              <div className="fs-manual-field">
                <label className="fs-manual-label">Food name</label>
                <input className="text-input" type="text" placeholder="e.g. Homemade lentil soup"
                  value={manualName} onChange={e => setManualName(e.target.value)} required />
              </div>
              <div className="fs-manual-row">
                <div className="fs-manual-field">
                  <label className="fs-manual-label">Sodium</label>
                  <div className="fs-manual-unit-wrap">
                    <input className="text-input text-input--narrow" type="number" min="0" placeholder="0"
                      value={manualSodium} onChange={e => setManualSodium(e.target.value)} />
                    <span className="fs-manual-unit">mg</span>
                  </div>
                </div>
                <div className="fs-manual-field">
                  <label className="fs-manual-label">Potassium</label>
                  <div className="fs-manual-unit-wrap">
                    <input className="text-input text-input--narrow" type="number" min="0" placeholder="0"
                      value={manualPotassium} onChange={e => setManualPotassium(e.target.value)} />
                    <span className="fs-manual-unit">mg</span>
                  </div>
                </div>
                <div className="fs-manual-field">
                  <label className="fs-manual-label">Magnesium</label>
                  <div className="fs-manual-unit-wrap">
                    <input className="text-input text-input--narrow" type="number" min="0" placeholder="0"
                      value={manualMagnesium} onChange={e => setManualMagnesium(e.target.value)} />
                    <span className="fs-manual-unit">mg</span>
                  </div>
                </div>
                <div className="fs-manual-field">
                  <label className="fs-manual-label">Date</label>
                  <input className="text-input text-input--narrow" type="date" value={manualDate}
                    onChange={e => setManualDate(e.target.value)} />
                </div>
              </div>
              <div className="fs-confirm-actions">
                <button className="btn-primary" type="submit" disabled={manualLogging || !manualName.trim()}>
                  {manualLogging ? 'Logging…' : 'Log manually'}
                </button>
                <button type="button" className="fs-cancel-btn" onClick={() => setShowManual(false)}>Cancel</button>
              </div>
            </form>
          )}

          {/* Search results — "Select" now opens confirm panel that adds to basket */}
          {isToday && results.length > 0 && !showManual && (
            <ul className="fs-results">
              {results.map(item => {
                const isOpen = confirmingItem?.fdcId === item.fdcId
                return (
                  <li key={item.fdcId} className="fs-result-li">
                    <div className={`fs-result-card${isOpen ? ' fs-result-card--open' : ''}`}>
                      <div className="fs-result-body">
                        <div className="fs-result-name">{item.description}</div>
                        <div className="fs-badges">
                          <MineralBadge value={item.sodium_mg}    type="sodium"    />
                          <MineralBadge value={item.potassium_mg} type="potassium" />
                          <MineralBadge value={item.magnesium_mg} type="magnesium" />
                        </div>
                      </div>
                      <button className="fs-select-btn" onClick={() => handleSelect(item)}>Select</button>
                    </div>

                    <div className={`fs-confirm${isOpen ? ' fs-confirm--open' : ''}`}>
                      <div className="fs-confirm-inner">
                        {isOpen && confirmPortionsLoading ? (
                          <div className="fs-confirm-loading">
                            <span className="fs-spinner fs-spinner--inline" />
                            <span className="fs-confirm-loading-text">Loading portions…</span>
                          </div>
                        ) : isOpen ? (
                          <>
                            <p className="fs-confirm-name">{item.description}</p>
                            <div className="fs-servings-row">
                              <label className="fs-servings-label" htmlFor={`qty-${item.fdcId}`}>Quantity</label>
                              {confirmPortionsFailed ? (
                                <>
                                  <input id={`qty-${item.fdcId}`} className="text-input text-input--narrow"
                                    type="number" min="1" step="1" value={confirmGramsInput}
                                    onChange={e => setConfirmGramsInput(Math.max(1, parseInt(e.target.value) || 100))} />
                                  <span className="fs-serving-hint">g</span>
                                </>
                              ) : (
                                <>
                                  <input id={`qty-${item.fdcId}`} className="text-input text-input--narrow"
                                    type="number" min="0.25" step="0.25" value={confirmQuantity}
                                    onChange={e => setConfirmQuantity(Math.max(0.25, parseFloat(e.target.value) || 1))} />
                                  <select className="fs-portion-select" value={confirmPortionIdx}
                                    onChange={e => setConfirmPortionIdx(parseInt(e.target.value))}>
                                    {confirmPortions.map((p, i) => (
                                      <option key={i} value={i}>{p.label}{p.label !== '100g' ? ` · ${p.grams}g` : ''}</option>
                                    ))}
                                  </select>
                                </>
                              )}
                            </div>
                            <div className="fs-computed">
                              <ComputedMineral label="Sodium"    value={confirmSodium}    />
                              <ComputedMineral label="Potassium" value={confirmPotassium} />
                              <ComputedMineral label="Magnesium" value={confirmMagnesium} />
                            </div>
                            <div className="fs-confirm-actions">
                              <button className="btn-primary" onClick={handleAddToBasket}>
                                + Add to basket
                              </button>
                              <button className="fs-cancel-btn" onClick={handleConfirmCancel}>Cancel</button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Basket */}
          {isToday && basket.length > 0 && (
            <div className="fh-basket">
              <div className="fh-basket-header">
                <span className="fh-basket-label">Basket</span>
                <span className="fh-basket-count">{basket.length} item{basket.length !== 1 ? 's' : ''}</span>
              </div>
              <ul className="fh-basket-list">
                {basket.map(item => {
                  const qty = parseFloat(item.quantity) || 1
                  const sod = item.sodiumPerUnit    != null ? Math.round(item.sodiumPerUnit    * qty) : null
                  const pot = item.potassiumPerUnit != null ? Math.round(item.potassiumPerUnit * qty) : null
                  const mag = item.magnesiumPerUnit != null ? Math.round(item.magnesiumPerUnit * qty) : null
                  return (
                    <li key={item.key} className="fh-basket-item">
                      <div className="fh-basket-item-info">
                        <span className="fh-basket-item-name">{item.description}</span>
                        <span className="fh-basket-item-nutrients">
                          Na {sod ?? '—'}mg · K {pot ?? '—'}mg · Mg {mag ?? '—'}mg
                        </span>
                      </div>
                      <div className="fh-basket-item-right">
                        <span className="fh-basket-item-portion">{item.portionLabel}</span>
                        <input
                          className="text-input text-input--narrow fh-basket-qty"
                          type="number" min="0.25" step="0.25"
                          value={item.quantity}
                          onChange={e => updateBasketQty(item.key, e.target.value)}
                        />
                        <button className="fh-basket-remove"
                          onClick={() => removeFromBasket(item.key)} aria-label="Remove">×</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="fh-basket-total">
                <span>Total</span>
                <span>Na {basketSodium}mg · K {basketPotassium}mg · Mg {basketMagnesium}mg</span>
              </div>
              <div className="fh-basket-actions">
                <button className="btn-primary" onClick={handleLogMeal} disabled={loggingMeal}>
                  {loggingMeal ? 'Logging…' : `Log ${activeMealType}`}
                </button>
                <button className="fs-cancel-btn" onClick={() => setBasket([])}>Clear</button>
              </div>
            </div>
          )}
        </section>

        {/* Log section */}
        <section className="fh-log-section">
          <h3 className="fh-log-heading">
            {isToday ? "Today's log" : `Log — ${formatLogDate(selectedDate)}`}
          </h3>
          {todayLog.length === 0 ? (
            <p className="fs-log-empty">{isToday ? 'No foods logged today' : 'No foods logged on this day'}</p>
          ) : (
            <>
              {MEAL_TYPES.map(mt => {
                const entries = logByMeal[mt]
                if (entries.length === 0) return null
                const mtSodium    = entries.reduce((s, e) => s + (e.sodium_mg    || 0), 0)
                const mtPotassium = entries.reduce((s, e) => s + (e.potassium_mg || 0), 0)
                const mtMagnesium = entries.reduce((s, e) => s + (e.magnesium_mg || 0), 0)
                return (
                  <div key={mt} className="fh-meal-group">
                    <div className="fh-meal-group-header">
                      <span className="fh-meal-group-label">{mt}</span>
                      <span className="fh-meal-group-totals">
                        Na {Math.round(mtSodium)}mg · K {Math.round(mtPotassium)}mg · Mg {Math.round(mtMagnesium)}mg
                      </span>
                    </div>
                    <ul className="fs-log-list">
                      {entries.map(entry => <LogEntry key={entry.id} entry={entry} {...editProps} />)}
                    </ul>
                  </div>
                )
              })}
              {unspecified.length > 0 && (
                <div className="fh-meal-group">
                  <div className="fh-meal-group-header">
                    <span className="fh-meal-group-label">Other</span>
                  </div>
                  <ul className="fs-log-list">
                    {unspecified.map(entry => <LogEntry key={entry.id} entry={entry} {...editProps} />)}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* My Meals */}
        <section className="fh-saved-section">
          <div className="fh-saved-header">
            <span className="fh-saved-title">My Meals</span>
            <button className="fh-create-meal-btn" onClick={() => setShowCreateMeal(true)}>
              + Create saved meal
            </button>
          </div>

          <div className="fh-my-meals">
            {savedMeals.length === 0 ? (
              <p className="fs-log-empty">No saved meals yet — create one to log it quickly later</p>
            ) : (
              <ul className="fh-my-meals-list">
                {savedMeals.map(meal => (
                  <li key={meal.id} className="fh-my-meal-card">
                    <div className="fh-my-meal-header">
                      <span className="fh-my-meal-name">{meal.name}</span>
                      <div className="fh-my-meal-actions">
                        <button className="btn-primary fh-relog-btn"
                          onClick={() => loadSavedMealIntoBasket(meal)}>
                          Add to log
                        </button>
                        <button className="fs-log-delete"
                          onClick={() => handleDeleteSavedMeal(meal.id)}
                          aria-label="Delete saved meal">×</button>
                      </div>
                    </div>
                    <ul className="fh-my-meal-items">
                      {meal.items.map(item => (
                        <li key={item.id} className="fh-my-meal-item">{item.food_name}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {showCreateMeal && (
          <CreateSavedMealPanel
            onSave={handleCreateSavedMeal}
            onCancel={() => setShowCreateMeal(false)}
          />
        )}

      </div>

      {/* Hydration + supplements sidebar */}
      <aside className="fh-sidebar">
        <HydrationTracker selectedDate={selectedDate} />
        <SupplementsSection selectedDate={selectedDate} />
      </aside>

      <div className={`fs-toast${toast ? ' fs-toast--visible' : ''}`}>✓ Logged!</div>
    </div>
  )
}

// Completely separate flow for creating a named saved meal
function CreateSavedMealPanel({ onSave, onCancel }) {
  const [mealName, setMealName] = useState('')
  const [mealBasket, setMealBasket] = useState([])
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const [confirmingItem, setConfirmingItem] = useState(null)
  const [confirmPortionsLoading, setConfirmPortionsLoading] = useState(false)
  const [confirmPortions, setConfirmPortions] = useState([])
  const [confirmBasePer100g, setConfirmBasePer100g] = useState(null)
  const [confirmPortionsFailed, setConfirmPortionsFailed] = useState(false)
  const [confirmPortionIdx, setConfirmPortionIdx] = useState(0)
  const [confirmQuantity, setConfirmQuantity] = useState(1)
  const [confirmGramsInput, setConfirmGramsInput] = useState(100)

  const debounceRef = useRef(null)
  const searchGenRef = useRef(0)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchGenRef.current += 1
    setResults([])
    setSearchError(null)
    if (!query.trim()) { setConfirmingItem(null); return }
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function doSearch(term) {
    const gen = searchGenRef.current
    setLoading(true)
    setConfirmingItem(null)
    try {
      const data = await api.searchFood(term)
      if (gen !== searchGenRef.current) return
      const items = Array.isArray(data) ? data.slice(0, 5) : []
      setResults(items)
      if (items.length === 0) setSearchError('empty')
    } catch {
      if (gen !== searchGenRef.current) return
      setSearchError('unavailable')
    } finally {
      if (gen === searchGenRef.current) setLoading(false)
    }
  }

  async function handleSelect(item) {
    setConfirmingItem(item)
    setConfirmQuantity(1)
    setConfirmPortionsFailed(false)
    setConfirmPortions([])
    setConfirmPortionIdx(0)
    setConfirmBasePer100g(null)
    setConfirmPortionsLoading(true)
    try {
      const data = await api.getFoodPortions(item.fdcId)
      const portionList = data.portions ?? []
      setConfirmPortions(portionList)
      setConfirmBasePer100g(data.basePer100g ?? null)
      const defaultIdx = portionList.findIndex(p => p.label !== '100g')
      setConfirmPortionIdx(defaultIdx >= 0 ? defaultIdx : 0)
    } catch {
      setConfirmPortionsFailed(true)
      setConfirmGramsInput(100)
    } finally {
      setConfirmPortionsLoading(false)
    }
  }

  const confirmGrams = confirmPortionsFailed
    ? confirmGramsInput
    : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
  const confirmBase = confirmBasePer100g ?? confirmingItem
  const confirmSodium    = confirmingItem ? calcMineral(confirmBase?.sodium_mg,    confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmPotassium = confirmingItem ? calcMineral(confirmBase?.potassium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmMagnesium = confirmingItem ? calcMineral(confirmBase?.magnesium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null

  function handleAddToMeal() {
    if (!confirmingItem) return
    const grams = confirmPortionsFailed ? confirmGramsInput : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
    const base = confirmBasePer100g ?? confirmingItem
    const qty = confirmPortionsFailed ? 1 : confirmQuantity
    const baseSodium    = confirmPortionsFailed ? confirmingItem.sodium_mg    : base?.sodium_mg
    const basePotassium = confirmPortionsFailed ? confirmingItem.potassium_mg : base?.potassium_mg
    const baseMagnesium = confirmPortionsFailed ? confirmingItem.magnesium_mg : base?.magnesium_mg
    const portionLabel = confirmPortionsFailed
      ? `${grams}g`
      : (confirmPortions[confirmPortionIdx]?.label ?? '100g')

    setMealBasket(prev => [...prev, {
      key: `${confirmingItem.fdcId ?? 'manual'}-${Date.now()}`,
      food_name: confirmingItem.description,
      fdc_id: confirmingItem.fdcId ?? null,
      default_serving_size: grams,
      // stored as per-serving (field name is a legacy misnomer in the schema)
      sodium_mg_per_100g:    calcMineral(baseSodium,    grams, qty),
      potassium_mg_per_100g: calcMineral(basePotassium, grams, qty),
      magnesium_mg_per_100g: calcMineral(baseMagnesium, grams, qty),
      portionLabel,
    }])

    setConfirmingItem(null)
    setConfirmPortions([])
    setConfirmBasePer100g(null)
    setConfirmPortionsFailed(false)
    setConfirmQuantity(1)
    setQuery('')
    setResults([])
    setSearchError(null)
  }

  async function handleSave() {
    if (!mealName.trim() || mealBasket.length === 0) return
    setSaving(true)
    try {
      const items = mealBasket.map(({ food_name, fdc_id, default_serving_size, sodium_mg_per_100g, potassium_mg_per_100g, magnesium_mg_per_100g }) => ({
        food_name, fdc_id, default_serving_size, sodium_mg_per_100g, potassium_mg_per_100g, magnesium_mg_per_100g,
      }))
      await onSave(mealName.trim(), items)
    } catch { } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fh-relog-overlay">
      <div className="fh-relog-modal fh-create-meal-modal">
        <h3 className="fh-relog-title">Create saved meal</h3>

        <div className="fs-manual-field">
          <label className="fs-manual-label">Meal name</label>
          <input className="text-input" type="text" placeholder="e.g. Yogurt Parfait Breakfast"
            value={mealName} onChange={e => setMealName(e.target.value)} autoFocus />
        </div>

        <div className="fs-input-wrap">
          {loading && <span className="fs-spinner" />}
          <input
            className={`text-input fs-input${loading ? ' fs-input--loading' : ''}`}
            type="text"
            placeholder="Search foods to add"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && !loading && (
            <button className="fs-clear" onClick={() => { setQuery(''); setResults([]); setSearchError(null); setConfirmingItem(null) }} aria-label="Clear">×</button>
          )}
        </div>

        {searchError === 'empty' && <p className="fs-empty">No results — try a more specific name</p>}
        {searchError === 'unavailable' && <p className="inline-error">Food search unavailable</p>}

        {results.length > 0 && (
          <ul className="fs-results fh-create-meal-results">
            {results.map(item => {
              const isOpen = confirmingItem?.fdcId === item.fdcId
              return (
                <li key={item.fdcId} className="fs-result-li">
                  <div className={`fs-result-card${isOpen ? ' fs-result-card--open' : ''}`}>
                    <div className="fs-result-body">
                      <div className="fs-result-name">{item.description}</div>
                      <div className="fs-badges">
                        <MineralBadge value={item.sodium_mg}    type="sodium"    />
                        <MineralBadge value={item.potassium_mg} type="potassium" />
                        <MineralBadge value={item.magnesium_mg} type="magnesium" />
                      </div>
                    </div>
                    <button className="fs-select-btn" onClick={() => handleSelect(item)}>Select</button>
                  </div>

                  <div className={`fs-confirm${isOpen ? ' fs-confirm--open' : ''}`}>
                    <div className="fs-confirm-inner">
                      {isOpen && confirmPortionsLoading ? (
                        <div className="fs-confirm-loading">
                          <span className="fs-spinner fs-spinner--inline" />
                          <span className="fs-confirm-loading-text">Loading portions…</span>
                        </div>
                      ) : isOpen ? (
                        <>
                          <p className="fs-confirm-name">{item.description}</p>
                          <div className="fs-servings-row">
                            <label className="fs-servings-label" htmlFor={`cmqty-${item.fdcId}`}>Quantity</label>
                            {confirmPortionsFailed ? (
                              <>
                                <input id={`cmqty-${item.fdcId}`} className="text-input text-input--narrow"
                                  type="number" min="1" step="1" value={confirmGramsInput}
                                  onChange={e => setConfirmGramsInput(Math.max(1, parseInt(e.target.value) || 100))} />
                                <span className="fs-serving-hint">g</span>
                              </>
                            ) : (
                              <>
                                <input id={`cmqty-${item.fdcId}`} className="text-input text-input--narrow"
                                  type="number" min="0.25" step="0.25" value={confirmQuantity}
                                  onChange={e => setConfirmQuantity(Math.max(0.25, parseFloat(e.target.value) || 1))} />
                                <select className="fs-portion-select" value={confirmPortionIdx}
                                  onChange={e => setConfirmPortionIdx(parseInt(e.target.value))}>
                                  {confirmPortions.map((p, i) => (
                                    <option key={i} value={i}>{p.label}{p.label !== '100g' ? ` · ${p.grams}g` : ''}</option>
                                  ))}
                                </select>
                              </>
                            )}
                          </div>
                          <div className="fs-computed">
                            <ComputedMineral label="Sodium"    value={confirmSodium}    />
                            <ComputedMineral label="Potassium" value={confirmPotassium} />
                            <ComputedMineral label="Magnesium" value={confirmMagnesium} />
                          </div>
                          <div className="fs-confirm-actions">
                            <button className="btn-primary" onClick={handleAddToMeal}>+ Add to meal</button>
                            <button className="fs-cancel-btn" onClick={() => setConfirmingItem(null)}>Cancel</button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {mealBasket.length > 0 && (
          <div className="fh-basket fh-basket--create">
            <div className="fh-basket-header">
              <span className="fh-basket-label">Foods in this meal</span>
              <span className="fh-basket-count">{mealBasket.length} item{mealBasket.length !== 1 ? 's' : ''}</span>
            </div>
            <ul className="fh-basket-list">
              {mealBasket.map(item => (
                <li key={item.key} className="fh-basket-item">
                  <div className="fh-basket-item-info">
                    <span className="fh-basket-item-name">{item.food_name}</span>
                    <span className="fh-basket-item-nutrients">
                      Na {item.sodium_mg_per_100g ?? '—'}mg · K {item.potassium_mg_per_100g ?? '—'}mg · Mg {item.magnesium_mg_per_100g ?? '—'}mg
                    </span>
                  </div>
                  <div className="fh-basket-item-right">
                    <span className="fh-basket-item-portion">{item.portionLabel}</span>
                    <button className="fh-basket-remove"
                      onClick={() => setMealBasket(prev => prev.filter(i => i.key !== item.key))}
                      aria-label="Remove">×</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="fs-confirm-actions">
          <button className="btn-primary" onClick={handleSave}
            disabled={saving || !mealName.trim() || mealBasket.length === 0}>
            {saving ? 'Saving…' : 'Save meal'}
          </button>
          <button className="fs-cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function LogEntry({
  entry, editingId,
  editPortionsLoading, editPortions, editBasePer100g,
  editPortionIdx, setEditPortionIdx,
  editQuantity, setEditQuantity,
  editSodium, setEditSodium,
  editPotassium, setEditPotassium,
  editMagnesium, setEditMagnesium,
  editComputedSodium, editComputedPotassium, editComputedMagnesium,
  editSaving, onEdit, onEditSave, onCancelEdit, onDelete,
}) {
  return (
    <li className={`fs-log-entry${editingId === entry.id ? ' fs-log-entry--editing' : ''}`}>
      <div className="fs-log-entry-row">
        <div className="fs-log-entry-text">
          <span className="fs-log-name">{entry.description}</span>
          <span className="fs-log-minerals">
            Na {Math.round(entry.sodium_mg    || 0)}mg
            {' · '}
            K {Math.round(entry.potassium_mg  || 0)}mg
            {' · '}
            Mg {Math.round(entry.magnesium_mg || 0)}mg
          </span>
        </div>
        <div className="fs-log-entry-actions">
          <button className="fs-log-edit-btn" onClick={() => onEdit(entry)} aria-label="Edit" title="Edit">✎</button>
          <button className="fs-log-delete" onClick={() => onDelete(entry.id)} aria-label="Remove">×</button>
        </div>
      </div>

      {editingId === entry.id && (
        <div className="fs-edit-panel">
          {editPortionsLoading ? (
            <div className="fs-confirm-loading">
              <span className="fs-spinner fs-spinner--inline" />
              <span className="fs-confirm-loading-text">Loading portions…</span>
            </div>
          ) : editPortions.length > 0 && editBasePer100g ? (
            <>
              <div className="fs-servings-row">
                <label className="fs-servings-label">Quantity</label>
                <input className="text-input text-input--narrow" type="number" min="0.25" step="0.25"
                  value={editQuantity}
                  onChange={e => setEditQuantity(Math.max(0.25, parseFloat(e.target.value) || 1))} />
                <select className="fs-portion-select" value={editPortionIdx}
                  onChange={e => setEditPortionIdx(parseInt(e.target.value))}>
                  {editPortions.map((p, i) => (
                    <option key={i} value={i}>{p.label}{p.label !== '100g' ? ` · ${p.grams}g` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="fs-computed">
                <ComputedMineral label="Sodium"    value={editComputedSodium}    />
                <ComputedMineral label="Potassium" value={editComputedPotassium} />
                <ComputedMineral label="Magnesium" value={editComputedMagnesium} />
              </div>
            </>
          ) : (
            <div className="fs-manual-row">
              <div className="fs-manual-field">
                <label className="fs-manual-label">Sodium</label>
                <div className="fs-manual-unit-wrap">
                  <input className="text-input text-input--narrow" type="number" min="0"
                    value={editSodium} onChange={e => setEditSodium(e.target.value)} />
                  <span className="fs-manual-unit">mg</span>
                </div>
              </div>
              <div className="fs-manual-field">
                <label className="fs-manual-label">Potassium</label>
                <div className="fs-manual-unit-wrap">
                  <input className="text-input text-input--narrow" type="number" min="0"
                    value={editPotassium} onChange={e => setEditPotassium(e.target.value)} />
                  <span className="fs-manual-unit">mg</span>
                </div>
              </div>
              <div className="fs-manual-field">
                <label className="fs-manual-label">Magnesium</label>
                <div className="fs-manual-unit-wrap">
                  <input className="text-input text-input--narrow" type="number" min="0"
                    value={editMagnesium} onChange={e => setEditMagnesium(e.target.value)} />
                  <span className="fs-manual-unit">mg</span>
                </div>
              </div>
            </div>
          )}
          <div className="fs-confirm-actions fs-edit-actions">
            <button className="btn-primary" onClick={() => onEditSave(entry)} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </button>
            <button className="fs-cancel-btn" onClick={onCancelEdit}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  )
}

const MINERAL_SYMBOL = { sodium: 'Na', potassium: 'K', magnesium: 'Mg' }

function MineralBadge({ value, type }) {
  const sym = MINERAL_SYMBOL[type] ?? type
  let cls = 'badge--neutral'
  let arrow = null

  if (value != null && value > 0) {
    if (type === 'sodium') {
      if (value <= 200) { cls = 'badge--green'; arrow = '↓bp' }
      else              { cls = 'badge--red';   arrow = '↑bp' }
    } else if (type === 'potassium') {
      if (value >= 200) { cls = 'badge--green'; arrow = '↓bp' }
      else              { cls = 'badge--amber' }
    } else if (type === 'magnesium') {
      cls = 'badge--blue'
    }
  }

  return (
    <span className={`mineral-badge ${cls}`}>
      {sym} {value != null && value > 0 ? `${Math.round(value)}mg` : '—'}
      {arrow && <span className="badge-impact"> {arrow}</span>}
    </span>
  )
}

function ComputedMineral({ label, value }) {
  return (
    <div className="fs-computed-item">
      <span className="fs-computed-label">{label}</span>
      <span className="fs-computed-value">{value != null ? `${value}mg` : '—'}</span>
    </div>
  )
}

function NutrientSummaryItem({ label, symbol, value, goal, colorVar }) {
  const pct = Math.min((value / goal) * 100, 100)
  const rounded = Math.round(value)
  return (
    <div className="fh-summary-item">
      <div className="fh-summary-header">
        <span className="fh-summary-symbol">{symbol}</span>
        <span className="fh-summary-label">{label}</span>
        <span className="fh-summary-value" style={{ color: colorVar }}>{rounded}<span className="fh-summary-unit">mg</span></span>
        <span className="fh-summary-goal">/ {goal}mg</span>
      </div>
      <div className="total-bar-track">
        <div className="total-bar-fill" style={{ width: `${pct}%`, background: colorVar }} />
      </div>
    </div>
  )
}

function SupplementsSection({ selectedDate }) {
  const [items, setItems] = useState([])
  const [showManage, setShowManage] = useState(false)

  useEffect(() => { fetchLog(selectedDate) }, [selectedDate])

  async function fetchLog(date) {
    try {
      const data = await api.getSupplementLog(date)
      setItems(Array.isArray(data) ? data : [])
    } catch {}
  }

  async function handleToggle(sup) {
    const newTaken = sup.taken ? 0 : 1
    setItems(prev => prev.map(s => s.id === sup.id ? { ...s, taken: newTaken } : s))
    try {
      await api.logSupplement({ supplement_id: sup.id, date: selectedDate, time_of_day: sup.time_of_day, taken: newTaken })
    } catch {
      setItems(prev => prev.map(s => s.id === sup.id ? { ...s, taken: sup.taken } : s))
    }
  }

  const TIME_GROUPS = ['morning', 'afternoon', 'evening']
  const grouped = TIME_GROUPS.reduce((acc, t) => { acc[t] = items.filter(s => s.time_of_day === t); return acc }, {})
  const takenCount = items.filter(s => s.taken).length

  return (
    <section className="fh-saved-section">
      <div className="fh-saved-header">
        <div className="fh-supp-header-left">
          <span className="fh-saved-title">Supplements</span>
          {items.length > 0 && (
            <span className="fh-supp-adherence">{takenCount}/{items.length}</span>
          )}
        </div>
        <button className="fh-create-meal-btn" onClick={() => setShowManage(true)}>Manage</button>
      </div>

      {items.length === 0 ? (
        <p className="fs-log-empty fh-supp-empty">No supplements configured — click Manage to add your first</p>
      ) : (
        <div className="fh-supp-groups">
          {TIME_GROUPS.map(t => {
            const grp = grouped[t]
            if (grp.length === 0) return null
            return (
              <div key={t} className="fh-supp-group">
                <div className="fh-supp-group-label">{t}</div>
                <ul className="fh-supp-list">
                  {grp.map(s => (
                    <li key={s.id} className={`fh-supp-item${s.taken ? ' fh-supp-item--taken' : ''}`}>
                      <button
                        className="fh-supp-toggle"
                        onClick={() => handleToggle(s)}
                        aria-label={s.taken ? 'Mark not taken' : 'Mark taken'}
                      >
                        {s.taken ? '✓' : ''}
                      </button>
                      <div className="fh-supp-info">
                        <span className="fh-supp-name">{s.name}</span>
                        <span className="fh-supp-detail">{s.dose} {s.unit}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {showManage && (
        <ManageSupplementsPanel onClose={() => { setShowManage(false); fetchLog(selectedDate) }} />
      )}
    </section>
  )
}

function ManageSupplementsPanel({ onClose }) {
  const [supplements, setSupplements] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fName, setFName] = useState('')
  const [fDose, setFDose] = useState('')
  const [fUnit, setFUnit] = useState('mg')
  const [fTime, setFTime] = useState('morning')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    try { const data = await api.getSupplements(); setSupplements(Array.isArray(data) ? data : []) } catch {}
  }

  function resetForm() { setFName(''); setFDose(''); setFUnit('mg'); setFTime('morning') }

  function startAdd() { setShowAdd(true); setEditingId(null); resetForm() }

  function startEdit(sup) {
    setEditingId(sup.id); setShowAdd(false)
    setFName(sup.name); setFDose(sup.dose); setFUnit(sup.unit); setFTime(sup.time_of_day)
  }

  async function handleAdd() {
    if (!fName.trim() || !fDose.trim()) return
    setSaving(true)
    try {
      await api.createSupplement({ name: fName.trim(), dose: fDose.trim(), unit: fUnit, time_of_day: fTime })
      setShowAdd(false); resetForm(); fetchAll()
    } catch {} finally { setSaving(false) }
  }

  async function handleEditSave(sup) {
    setSaving(true)
    try {
      await api.updateSupplement(sup.id, { name: fName.trim(), dose: fDose.trim(), unit: fUnit, time_of_day: fTime })
      setEditingId(null); resetForm(); fetchAll()
    } catch {} finally { setSaving(false) }
  }

  async function handleDeactivate(id) {
    try { await api.deleteSupplement(id); fetchAll() } catch {}
  }

  const formProps = { fName, setFName, fDose, setFDose, fUnit, setFUnit, fTime, setFTime, disabled: saving }

  return (
    <div className="fh-relog-overlay">
      <div className="fh-relog-modal fh-supp-modal">
        <div className="fh-supp-modal-header">
          <h3 className="fh-relog-title">Manage supplements</h3>
          <button className="fs-cancel-btn" onClick={onClose}>✕ Close</button>
        </div>

        {supplements.length === 0 && !showAdd && (
          <p className="fs-log-empty">No supplements yet</p>
        )}

        {supplements.length > 0 && (
          <ul className="fh-supp-manage-list">
            {supplements.map(sup => (
              <li key={sup.id} className="fh-supp-manage-item">
                {editingId === sup.id ? (
                  <SupplementForm
                    {...formProps}
                    onSave={() => handleEditSave(sup)}
                    onCancel={() => { setEditingId(null); resetForm() }}
                    saveLabel={saving ? 'Saving…' : 'Save'}
                  />
                ) : (
                  <div className="fh-supp-manage-row">
                    <div className="fh-supp-manage-info">
                      <span className="fh-supp-name">{sup.name}</span>
                      <span className="fh-supp-detail">{sup.dose} {sup.unit} · {sup.time_of_day}</span>
                    </div>
                    <div className="fh-supp-manage-actions">
                      <button className="fs-log-edit-btn" onClick={() => startEdit(sup)} title="Edit">✎</button>
                      <button className="fh-supp-deactivate-btn" onClick={() => handleDeactivate(sup.id)} title="Deactivate">×</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {showAdd ? (
          <SupplementForm
            {...formProps}
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); resetForm() }}
            saveLabel={saving ? 'Adding…' : 'Add supplement'}
          />
        ) : editingId == null && (
          <button className="fh-create-meal-btn" onClick={startAdd}>+ Add supplement</button>
        )}
      </div>
    </div>
  )
}

function SupplementForm({ fName, setFName, fDose, setFDose, fUnit, setFUnit, fTime, setFTime, onSave, onCancel, saveLabel, disabled }) {
  return (
    <div className="fh-supp-form">
      <div className="fh-supp-form-row">
        <div className="fs-manual-field fh-supp-field--name">
          <label className="fs-manual-label">Name</label>
          <input className="text-input" type="text" placeholder="e.g. Magnesium"
            value={fName} onChange={e => setFName(e.target.value)} autoFocus />
        </div>
        <div className="fs-manual-field">
          <label className="fs-manual-label">Dose</label>
          <input className="text-input text-input--narrow" type="text" placeholder="400"
            value={fDose} onChange={e => setFDose(e.target.value)} />
        </div>
        <div className="fs-manual-field">
          <label className="fs-manual-label">Unit</label>
          <select className="fs-portion-select" value={fUnit} onChange={e => setFUnit(e.target.value)}>
            <option value="mg">mg</option>
            <option value="mcg">mcg</option>
            <option value="g">g</option>
            <option value="IU">IU</option>
            <option value="capsule">cap</option>
          </select>
        </div>
        <div className="fs-manual-field">
          <label className="fs-manual-label">Time</label>
          <select className="fs-portion-select" value={fTime} onChange={e => setFTime(e.target.value)}>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </div>
      </div>
      <div className="fs-confirm-actions">
        <button className="btn-primary" onClick={onSave} disabled={disabled || !fName.trim() || !fDose.trim()}>
          {saveLabel}
        </button>
        <button className="fs-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function HydrationTracker({ selectedDate }) {
  const [todayOz, setTodayOz] = useState(0)
  const [input, setInput] = useState('')
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    setTodayOz(0)
    fetch(`/api/hydration?date=${selectedDate}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return
        const total = data.total_oz ?? data.oz ?? null
        if (total != null) setTodayOz(total)
      })
      .catch(() => {})
  }, [selectedDate])

  async function handleAdd(e) {
    e.preventDefault()
    const oz = parseFloat(input)
    if (!oz || oz <= 0) return
    setLogging(true)
    setTodayOz(prev => prev + oz)
    setInput('')
    try {
      await api.logHydration(oz, selectedDate)
    } catch {
      setTodayOz(prev => prev - oz)
    } finally {
      setLogging(false)
    }
  }

  const pct = Math.min((todayOz / DAILY_GOAL_OZ) * 100, 100)
  const remaining = Math.max(DAILY_GOAL_OZ - todayOz, 0)

  return (
    <section className="fh-card fh-card--hydration">
      <h2 className="card-title">Hydration</h2>
      <p className="card-desc">Daily goal: {DAILY_GOAL_OZ} oz</p>

      <div className="hydration-display">
        <div className="hydration-numbers">
          <span className="hydration-current">{todayOz}</span>
          <span className="hydration-sep">/</span>
          <span className="hydration-goal">{DAILY_GOAL_OZ}</span>
          <span className="hydration-unit">oz</span>
        </div>
        {remaining > 0 ? (
          <p className="hydration-remaining">{remaining} oz remaining</p>
        ) : (
          <p className="hydration-complete">Daily goal reached</p>
        )}
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-labels">
        <span>0</span>
        <span>{DAILY_GOAL_OZ / 2}</span>
        <span>{DAILY_GOAL_OZ} oz</span>
      </div>

      <form className="row-form hydration-form" onSubmit={handleAdd}>
        <input
          className="text-input text-input--narrow"
          type="number"
          placeholder="oz"
          min="0"
          max="200"
          step="0.5"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={logging}
        />
        <button className="btn-primary" type="submit" disabled={logging || !input}>
          {logging ? '…' : '+ Add'}
        </button>
      </form>
    </section>
  )
}
