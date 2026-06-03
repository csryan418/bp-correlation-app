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

function localDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function gramsToFlOz(grams) {
  return Math.round((grams / 29.57) * 2) / 2
}

function dedupePortions(portions) {
  const seen = new Set()
  return portions.filter(p => {
    const name = p.portionDescription || p.description || p.modifier || p.label || ''
    if (name === 'Quantity not specified') return false
    const key = `${name}|${p.grams}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function FoodHydration() {
  const today = localDateString()
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
          <p className="page-subtitle">Log today's food, water intake, and supplements.</p>
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
  const today = localDateString()
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
  const [confirmIsBeverage, setConfirmIsBeverage] = useState(false)

  // Basket — items staged for "Log Meal"
  const [basket, setBasket] = useState([])
  const [loggingMeal, setLoggingMeal] = useState(false)

  // Toast & log
  const [toast, setToast] = useState(false)
  const [todayLog, setTodayLog] = useState([])
  const [collapsedMeals, setCollapsedMeals] = useState(new Set())

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
  const [editIsBeverage, setEditIsBeverage] = useState(false)
  const [editSodiumBase, setEditSodiumBase] = useState(null)
  const [editPotassiumBase, setEditPotassiumBase] = useState(null)
  const [editMagnesiumBase, setEditMagnesiumBase] = useState(null)

  // Manual entry
  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualSodium, setManualSodium] = useState('')
  const [manualPotassium, setManualPotassium] = useState('')
  const [manualMagnesium, setManualMagnesium] = useState('')
  const [manualDate, setManualDate] = useState(today)
  const [manualLogging, setManualLogging] = useState(false)

  // Copy to today
  const [copyConfirmMeal, setCopyConfirmMeal] = useState(null)
  const [copySuccessMeal, setCopySuccessMeal] = useState(null)
  const copySuccessRef = useRef(null)

  // Saved meals
  const [savedMeals, setSavedMeals] = useState([])
  const [showCreateMeal, setShowCreateMeal] = useState(false)
  const [mealsExpanded, setMealsExpanded] = useState(false)
  const [confirmDeleteMealId, setConfirmDeleteMealId] = useState(null)

  // Meal template editing
  const [editingMealId, setEditingMealId] = useState(null)
  const [editingItems, setEditingItems] = useState([])
  const [deletedItemIds, setDeletedItemIds] = useState([])
  const [mealSaving, setMealSaving] = useState(false)
  const [replacingItemKey, setReplacingItemKey] = useState(null)

  // Save as Meal (from basket)
  const [showSaveMeal, setShowSaveMeal] = useState(false)
  const [savingMealName, setSavingMealName] = useState('')
  const [savingMeal, setSavingMeal] = useState(false)
  const [saveMealSuccess, setSaveMealSuccess] = useState(false)

  const debounceRef = useRef(null)
  const toastRef = useRef(null)
  const searchGenRef = useRef(0)

  // Voice recognition
  const voiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceError, setVoiceError] = useState(null)
  const [voiceUnmatched, setVoiceUnmatched] = useState([])
  const [voiceConfirmQueue, setVoiceConfirmQueue] = useState([])

  useEffect(() => { fetchSavedMeals() }, [])
  useEffect(() => {
    fetchLog(selectedDate)
    setEditingId(null)
    setShowManual(false)
    setConfirmingItem(null)
    setVoiceConfirmQueue([])
    setVoiceError(null)
    setVoiceUnmatched([])
    setQuery('')
    setResults([])
    setSearchError(null)
    setCollapsedMeals(new Set())
  }, [selectedDate])

  async function fetchLog(date) {
    try {
      const data = await api.getFoodLog(date)
      setTodayLog(Array.isArray(data) ? data : [])
    } catch { }
  }

  async function fetchSavedMeals() {
    try {
      const data = await api.getMeals()
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
      const items = Array.isArray(data) ? data.slice(0, 10) : []
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
      console.log('portions API response', data)
      console.log('isBeverage:', data.isBeverage)
      const portionList = dedupePortions(data.portions ?? [])
      setConfirmPortions(portionList)
      setConfirmBasePer100g(data.basePer100g ?? null)
      setConfirmIsBeverage(data.isBeverage ?? false)
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
    const wasVoice = voiceConfirmQueue.length > 0
    setVoiceConfirmQueue([])
    setConfirmingItem(null)
    setConfirmPortions([])
    setConfirmBasePer100g(null)
    setConfirmPortionsFailed(false)
    setConfirmQuantity(1)
    setConfirmIsBeverage(false)
    if (wasVoice) {
      setResults([])
      setQuery('')
    }
  }

  function clearQuery() {
    setVoiceConfirmQueue([])
    setQuery('')
    setResults([])
    setSearchError(null)
    setConfirmingItem(null)
  }

  function handleVoiceClick() {
    if (voiceState !== 'idle') return
    setVoiceError(null)
    setVoiceUnmatched([])
    setVoiceConfirmQueue([])
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    setVoiceState('listening')
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    let handled = false
    const timeout = setTimeout(() => rec.stop(), 10000)

    rec.onresult = async (e) => {
      handled = true
      clearTimeout(timeout)
      const transcript = e.results[0][0].transcript
      setVoiceState('processing')
      await processVoiceTranscript(transcript)
      setVoiceState('idle')
    }

    rec.onerror = (err) => {
      handled = true
      clearTimeout(timeout)
      setVoiceState('idle')
      if (err.error !== 'no-speech' && err.error !== 'aborted') {
        setVoiceError('mic_error')
      }
    }

    rec.onend = () => {
      clearTimeout(timeout)
      if (!handled) setVoiceState('idle')
    }

    try {
      rec.start()
    } catch {
      setVoiceState('idle')
      setVoiceError('mic_error')
    }
  }

  function openVoiceConfirm(queue) {
    const { item, portionList, basePer100g, isBeverage, portionsFailed, portionIdx, parsedQuantity } = queue[0]
    setResults([item])
    setSearchError(null)
    setConfirmingItem(item)
    setConfirmPortions(portionList)
    setConfirmBasePer100g(basePer100g)
    setConfirmIsBeverage(isBeverage)
    setConfirmPortionsFailed(portionsFailed)
    setConfirmPortionIdx(portionIdx)
    setConfirmQuantity(parsedQuantity)
    setConfirmGramsInput(100)
    setConfirmPortionsLoading(false)
  }

  async function processVoiceTranscript(transcript) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) { setVoiceError('parse_error'); return }

    let parsed
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: 'You are a food logging assistant. Parse the user\'s spoken input into a JSON array of food items. Each item should have:\n- food_name: string (the food item, cleaned up for search)\n- quantity: number (default 1 if not specified)\n- serving_hint: string (e.g. \'medium\', \'large\', \'cup\', \'slice\' — null if not specified)\n\nReturn ONLY valid JSON, no explanation, no markdown. Example output: [{"food_name": "banana", "quantity": 1, "serving_hint": "medium"}, {"food_name": "hard boiled egg", "quantity": 2, "serving_hint": null}]',
          messages: [{ role: 'user', content: transcript }],
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const text = data.content?.[0]?.text ?? ''
      parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('Not an array')
    } catch {
      setVoiceError('parse_error')
      return
    }

    const unmatched = []
    const queue = []

    for (const item of parsed) {
      if (!item.food_name) continue
      try {
        const searchResults = await api.searchFood(item.food_name)
        const match = Array.isArray(searchResults) && searchResults[0]
        if (!match) { unmatched.push(item); continue }

        let portionList = []
        let basePer100g = null
        let isBeverage = false
        let portionsFailed = false
        let portionIdx = 0

        try {
          const portionsData = await api.getFoodPortions(match.fdcId)
          portionList = dedupePortions(portionsData.portions ?? [])
          basePer100g = portionsData.basePer100g ?? null
          isBeverage = portionsData.isBeverage ?? false

          portionIdx = portionList.findIndex(p => p.label !== '100g')
          if (portionIdx < 0) portionIdx = 0

          if (item.serving_hint && portionList.length > 0) {
            const hint = item.serving_hint.toLowerCase()
            const hintIdx = portionList.findIndex(p => {
              const name = (p.portionDescription || p.description || p.modifier || '').toLowerCase()
              return name.includes(hint)
            })
            if (hintIdx >= 0) portionIdx = hintIdx
          }
        } catch {
          portionsFailed = true
        }

        queue.push({ item: match, portionList, basePer100g, isBeverage, portionsFailed, portionIdx, parsedQuantity: item.quantity ?? 1 })
      } catch {
        unmatched.push(item)
      }
    }

    if (unmatched.length > 0) setVoiceUnmatched(unmatched)

    if (queue.length > 0) {
      setVoiceConfirmQueue(queue)
      openVoiceConfirm(queue)
    }
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

    if (voiceConfirmQueue.length > 1) {
      const nextQueue = voiceConfirmQueue.slice(1)
      setVoiceConfirmQueue(nextQueue)
      openVoiceConfirm(nextQueue)
      return
    }

    setVoiceConfirmQueue([])
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
          date: selectedDate,
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

  // Edit in-place handlers (unchanged)
  async function openEdit(entry) {
    if (editingId === entry.id) { setEditingId(null); return }
    setEditingId(entry.id)
    setEditPortions([])
    setEditBasePer100g(null)
    setEditPortionIdx(0)
    const qty = parseFloat(entry.serving_size) || 1
    setEditQuantity(qty)
    setEditSodiumBase(entry.sodium_mg    != null ? entry.sodium_mg    / qty : null)
    setEditPotassiumBase(entry.potassium_mg != null ? entry.potassium_mg / qty : null)
    setEditMagnesiumBase(entry.magnesium_mg != null ? entry.magnesium_mg / qty : null)
    setEditSodium(String(Math.round(entry.sodium_mg    || 0)))
    setEditPotassium(String(Math.round(entry.potassium_mg || 0)))
    setEditMagnesium(String(Math.round(entry.magnesium_mg || 0)))
    async function loadPortions(fdcId) {
      const data = await api.getFoodPortions(fdcId)
      const portionList = dedupePortions(data.portions ?? [])
      setEditPortions(portionList)
      setEditBasePer100g(data.basePer100g ?? null)
      setEditIsBeverage(data.isBeverage ?? false)
      const defaultIdx = portionList.findIndex(p => p.label !== '100g')
      setEditPortionIdx(defaultIdx >= 0 ? defaultIdx : 0)
    }

    const fdcId = parseInt(entry.fdc_id)
    setEditPortionsLoading(true)
    try {
      if (fdcId) {
        await loadPortions(fdcId)
      } else if (entry.description) {
        // fdc_id not stored — look it up by name (USDA descriptions are exact)
        const results = await api.searchFood(entry.description)
        const match = Array.isArray(results) && results[0]
        if (match?.fdcId) await loadPortions(match.fdcId)
      }
    } catch { } finally {
      setEditPortionsLoading(false)
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
      setManualDate(selectedDate)
      fetchLog(selectedDate)
    } catch { } finally {
      setManualLogging(false)
    }
  }

  async function handleDeleteSavedMeal(id) {
    try { await api.deleteMeal(id); fetchSavedMeals() } catch { }
  }

  async function handleCreateSavedMeal(name, items) {
    await api.createMeal(name, items)
    setShowCreateMeal(false)
    fetchSavedMeals()
  }

  async function handleSaveAsMeal() {
    if (!savingMealName.trim() || basket.length < 2) return
    setSavingMeal(true)
    try {
      const items = basket.map(item => {
        const qty = parseFloat(item.quantity) || 1
        return {
          food_name: item.description,
          fdc_id: item.fdcId ? String(parseInt(item.fdcId)) : null,
          serving_size: qty,
          serving_unit: item.portionLabel,
          calories: null,
          sodium:    item.sodiumPerUnit    != null ? Math.round(item.sodiumPerUnit    * qty) : null,
          potassium: item.potassiumPerUnit != null ? Math.round(item.potassiumPerUnit * qty) : null,
          magnesium: item.magnesiumPerUnit != null ? Math.round(item.magnesiumPerUnit * qty) : null,
        }
      })
      await api.createMeal(savingMealName.trim(), items)
      setSaveMealSuccess(true)
      fetchSavedMeals()
      setTimeout(() => {
        setSaveMealSuccess(false)
        setShowSaveMeal(false)
        setSavingMealName('')
      }, 2000)
    } catch { } finally {
      setSavingMeal(false)
    }
  }

  async function handleLoadMeal(mealId) {
    try {
      const data = await api.loadMeal(mealId)
      const items = (data.items ?? []).map(item => ({
        key: `tmpl-${item.id}-${Date.now()}`,
        fdcId: item.fdc_id ? parseInt(item.fdc_id) : null,
        description: item.food_name,
        sodiumPerUnit:    item.sodium    ?? null,
        potassiumPerUnit: item.potassium ?? null,
        magnesiumPerUnit: item.magnesium ?? null,
        quantity: item.serving_size ?? 1,
        portionLabel: item.serving_unit ?? '1 srv',
      }))
      setBasket(items)
    } catch { }
  }

  // Meal template edit handlers
  function enterEditMode(meal) {
    if (editingMealId === meal.id) { cancelEditMode(); return }
    setEditingMealId(meal.id)
    setEditingItems(meal.items.map(item => ({
      _key: `e-${item.id}`,
      id: item.id,
      food_name: item.food_name,
      fdc_id: item.fdc_id ?? null,
      serving_size: item.serving_size ?? 1,
      serving_unit: item.serving_unit ?? '1 srv',
      calories: item.calories ?? null,
      sodium: item.sodium ?? null,
      potassium: item.potassium ?? null,
      magnesium: item.magnesium ?? null,
      _perUnit: null,
    })))
    setDeletedItemIds([])
    setReplacingItemKey(null)
  }

  function cancelEditMode() {
    setEditingMealId(null)
    setEditingItems([])
    setDeletedItemIds([])
    setReplacingItemKey(null)
  }

  function updateEditItemQty(key, val) {
    const qty = Math.max(0.25, parseFloat(val) || 0.25)
    setEditingItems(prev => prev.map(i => i._key === key ? { ...i, serving_size: qty } : i))
  }

  function removeEditItem(key) {
    setEditingItems(prev => {
      const item = prev.find(i => i._key === key)
      if (item?.id) setDeletedItemIds(d => [...d, item.id])
      return prev.filter(i => i._key !== key)
    })
    setReplacingItemKey(prev => prev === key ? null : prev)
  }

  function replaceEditItem(key, selected) {
    setEditingItems(prev => prev.map(i => i._key !== key ? i : {
      ...i,
      food_name: selected.food_name,
      fdc_id: selected.fdc_id ?? null,
      serving_size: selected.serving_size,
      serving_unit: selected.serving_unit,
      calories: selected.calories ?? null,
      sodium: selected.sodium ?? null,
      potassium: selected.potassium ?? null,
      magnesium: selected.magnesium ?? null,
      _perUnit: selected._perUnit ?? null,
    }))
  }

  function addEditItem(selected) {
    setEditingItems(prev => [...prev, {
      _key: `new-${Date.now()}`,
      id: null,
      food_name: selected.food_name,
      fdc_id: selected.fdc_id ?? null,
      serving_size: selected.serving_size,
      serving_unit: selected.serving_unit,
      calories: selected.calories ?? null,
      sodium: selected.sodium ?? null,
      potassium: selected.potassium ?? null,
      magnesium: selected.magnesium ?? null,
      _perUnit: selected._perUnit ?? null,
    }])
  }

  async function handleMealEditSave(meal) {
    setMealSaving(true)
    try {
      for (const itemId of deletedItemIds) {
        await api.deleteMealItem(meal.id, itemId)
      }
      for (const item of editingItems) {
        const payload = {
          food_name: item.food_name,
          fdc_id: item.fdc_id ?? null,
          serving_size: item.serving_size,
          serving_unit: item.serving_unit,
          calories: item.calories ?? null,
          sodium:    item._perUnit ? item._perUnit.sodium    : item.sodium,
          potassium: item._perUnit ? item._perUnit.potassium : item.potassium,
          magnesium: item._perUnit ? item._perUnit.magnesium : item.magnesium,
        }
        if (item.id) {
          await api.updateMealItem(meal.id, item.id, payload)
        } else {
          await api.addMealItem(meal.id, payload)
        }
      }
      cancelEditMode()
      fetchSavedMeals()
    } catch { } finally {
      setMealSaving(false)
    }
  }

  async function handleCopyMeal(mt) {
    setCopyConfirmMeal(null)
    try {
      await api.copyMeal(selectedDate, mt, today)
      setCopySuccessMeal(mt)
      clearTimeout(copySuccessRef.current)
      copySuccessRef.current = setTimeout(() => setCopySuccessMeal(null), 2500)
    } catch { }
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

  function handleEditManualQtyChange(val) {
    const q = Math.max(0.25, parseFloat(val) || 0.25)
    setEditQuantity(q)
    if (editSodiumBase    != null) setEditSodium(String(Math.round(editSodiumBase    * q)))
    if (editPotassiumBase != null) setEditPotassium(String(Math.round(editPotassiumBase * q)))
    if (editMagnesiumBase != null) setEditMagnesium(String(Math.round(editMagnesiumBase * q)))
  }

  const editProps = {
    editingId, editPortionsLoading, editPortions, editBasePer100g,
    editPortionIdx, setEditPortionIdx, editQuantity, setEditQuantity,
    editSodium, setEditSodium, editPotassium, setEditPotassium,
    editMagnesium, setEditMagnesium,
    editComputedSodium, editComputedPotassium, editComputedMagnesium,
    editIsBeverage,
    onEditManualQtyChange: handleEditManualQtyChange,
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

          <>
            <div className="fs-input-row">
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
              {voiceSupported && (
                <button
                  className={`fs-mic-btn${voiceState === 'listening' ? ' fs-mic-btn--listening' : ''}${voiceState === 'processing' ? ' fs-mic-btn--processing' : ''}`}
                  onClick={handleVoiceClick}
                  disabled={voiceState !== 'idle'}
                  aria-label={voiceState === 'listening' ? 'Listening…' : voiceState === 'processing' ? 'Processing…' : 'Search by voice'}
                  title="Search by voice"
                >
                  {voiceState === 'processing' ? (
                    <span className="fs-mic-spinner" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
              )}
            </div>
            {voiceError === 'mic_error' && (
              <div className="fh-voice-banner fh-voice-banner--error">
                <span>Microphone error — try again</span>
                <button className="fh-voice-dismiss" onClick={() => setVoiceError(null)} aria-label="Dismiss">×</button>
              </div>
            )}
            {voiceError === 'parse_error' && (
              <div className="fh-voice-banner fh-voice-banner--error">
                <span>Couldn't parse that — try again or type your food</span>
                <button className="fh-voice-dismiss" onClick={() => setVoiceError(null)} aria-label="Dismiss">×</button>
              </div>
            )}
            {voiceUnmatched.length > 0 && (
              <div className="fh-voice-banner fh-voice-banner--warn">
                <span>No match found for: {voiceUnmatched.map(i => i.food_name).join(', ')}</span>
                <button className="fh-voice-dismiss" onClick={() => setVoiceUnmatched([])} aria-label="Dismiss">×</button>
              </div>
            )}
            <button className="fs-manual-link" onClick={() => { setManualDate(selectedDate); setShowManual(v => !v); setConfirmingItem(null) }}>
              {showManual ? '↑ Hide manual entry' : '+ Enter manually'}
            </button>
          </>

          {searchError === 'unavailable' && <p className="inline-error">Food search unavailable</p>}
          {searchError === 'empty' && <p className="fs-empty">No results — try a more specific name</p>}

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
                  <input className="text-input" type="date" value={manualDate}
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
          {results.length > 0 && !showManual && (
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
                                    {confirmPortions.map((p, i) => {
                                      const name = p.portionDescription || p.description || p.modifier || 'Serving'
                                      return (
                                        <option key={i} value={i}>
                                          {p.label === '100g'
                                            ? '100g'
                                            : `${name}${confirmIsBeverage && !name.includes('fl oz') ? ` (${gramsToFlOz(p.grams)} fl oz)` : ''} · ${p.grams}g`}
                                        </option>
                                      )
                                    })}
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
          {basket.length > 0 && (
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
                <button className="fs-cancel-btn" onClick={() => { setBasket([]); setShowSaveMeal(false); setSavingMealName('') }}>Clear</button>
                {basket.length >= 2 && !showSaveMeal && (
                  <button className="fh-save-as-meal-btn" onClick={() => setShowSaveMeal(true)}>
                    Save as Meal
                  </button>
                )}
              </div>
              {basket.length >= 2 && showSaveMeal && (
                <div className="fh-basket-save-row">
                  {saveMealSuccess ? (
                    <span className="fh-save-meal-success">✓ Saved!</span>
                  ) : (
                    <div className="fh-save-inline-form">
                      <input
                        className="text-input fh-save-inline-input"
                        type="text"
                        placeholder="Name this meal…"
                        value={savingMealName}
                        onChange={e => setSavingMealName(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && savingMealName.trim()) handleSaveAsMeal()
                          if (e.key === 'Escape') { setShowSaveMeal(false); setSavingMealName('') }
                        }}
                      />
                      <button className="btn-primary" onClick={handleSaveAsMeal}
                        disabled={savingMeal || !savingMealName.trim()}>
                        {savingMeal ? 'Saving…' : 'Save'}
                      </button>
                      <button className="fs-cancel-btn"
                        onClick={() => { setShowSaveMeal(false); setSavingMealName('') }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
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
                const isCollapsed = collapsedMeals.has(mt)
                const mtSodium    = entries.reduce((s, e) => s + (e.sodium_mg    || 0), 0)
                const mtPotassium = entries.reduce((s, e) => s + (e.potassium_mg || 0), 0)
                const mtMagnesium = entries.reduce((s, e) => s + (e.magnesium_mg || 0), 0)
                return (
                  <div key={mt} className="fh-meal-group">
                    <div
                      className={`fh-meal-group-header fh-meal-group-header--clickable${!isToday ? ' fh-meal-group-header--past' : ''}`}
                      onClick={() => setCollapsedMeals(prev => {
                        const next = new Set(prev)
                        next.has(mt) ? next.delete(mt) : next.add(mt)
                        return next
                      })}
                    >
                      <div className="fh-meal-group-header-row1">
                        <span className="fh-meal-group-label">{mt}</span>
                        <div className="fh-meal-group-header-right">
                          <span className="fh-meal-group-totals">
                            Na {Math.round(mtSodium)}mg · K {Math.round(mtPotassium)}mg · Mg {Math.round(mtMagnesium)}mg
                          </span>
                          <span className={`fh-meals-chevron${isCollapsed ? '' : ' fh-meals-chevron--up'}`} aria-hidden="true">›</span>
                        </div>
                      </div>
                      {!isToday && (
                        <div className="fh-meal-group-copy-row" onClick={e => e.stopPropagation()}>
                          {copySuccessMeal === mt ? (
                            <span className="fh-copy-success">{mt} copied to today</span>
                          ) : copyConfirmMeal === mt ? (
                            <>
                              <span className="fh-copy-confirm-msg">Copy {mt} to today?</span>
                              <button className="fh-copy-confirm-yes" onClick={() => handleCopyMeal(mt)}>Yes, copy</button>
                              <button className="fh-copy-confirm-cancel" onClick={() => setCopyConfirmMeal(null)}>Cancel</button>
                            </>
                          ) : (
                            <button
                              className="fh-copy-btn"
                              onClick={e => { e.stopPropagation(); setCopyConfirmMeal(mt) }}
                              aria-label={`Copy ${mt} to today`}
                            >Copy to Today</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`fh-meal-group-body${isCollapsed ? '' : ' fh-meal-group-body--open'}`}>
                      <ul className="fs-log-list">
                        {entries.map(entry => <LogEntry key={entry.id} entry={entry} {...editProps} />)}
                      </ul>
                    </div>
                  </div>
                )
              })}
              {unspecified.length > 0 && (
                <div className="fh-meal-group">
                  <div
                    className="fh-meal-group-header fh-meal-group-header--clickable"
                    onClick={() => setCollapsedMeals(prev => {
                      const next = new Set(prev)
                      next.has('Other') ? next.delete('Other') : next.add('Other')
                      return next
                    })}
                  >
                    <span className="fh-meal-group-label">Other</span>
                    <span className={`fh-meals-chevron${collapsedMeals.has('Other') ? '' : ' fh-meals-chevron--up'}`} aria-hidden="true">›</span>
                  </div>
                  <div className={`fh-meal-group-body${collapsedMeals.has('Other') ? '' : ' fh-meal-group-body--open'}`}>
                    <ul className="fs-log-list">
                      {unspecified.map(entry => <LogEntry key={entry.id} entry={entry} {...editProps} />)}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* My Meals */}
        <section className="fh-saved-section">
          <div
            className="fh-saved-header fh-saved-header--clickable"
            onClick={() => setMealsExpanded(v => !v)}
          >
            <span className="fh-saved-title">My Meals</span>
            <div className="fh-meals-header-right">
              <button
                className="fh-create-meal-btn"
                onClick={e => { e.stopPropagation(); setShowCreateMeal(true) }}
              >
                + Create saved meal
              </button>
              <span className={`fh-meals-chevron${mealsExpanded ? ' fh-meals-chevron--up' : ''}`} aria-hidden="true">›</span>
            </div>
          </div>

          <div className={`fh-my-meals${mealsExpanded ? ' fh-my-meals--open' : ''}`}>
            {savedMeals.length === 0 ? (
              <p className="fs-log-empty">No saved meals yet — create one to log it quickly later</p>
            ) : (
              <ul className="fh-my-meals-list">
                {savedMeals.map(meal => {
                  const isEditing = editingMealId === meal.id
                  const displayCount = isEditing ? editingItems.length : meal.items.length
                  return (
                    <li key={meal.id} className={`fh-my-meal-card${isEditing ? ' fh-my-meal-card--editing' : ''}`}>
                      <div className="fh-my-meal-header">
                        <div className="fh-my-meal-title-group">
                          <span className="fh-my-meal-name">{meal.name}</span>
                          <span className="fh-my-meal-count">{displayCount} item{displayCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="fh-my-meal-actions">
                          {!isEditing && (
                            <button className="btn-primary fh-relog-btn" onClick={() => handleLoadMeal(meal.id)}>
                              Add to Log
                            </button>
                          )}
                          <div className="fs-log-entry-actions">
                            <button
                              className="fs-log-edit-btn"
                              onClick={() => enterEditMode(meal)}
                              aria-label={isEditing ? 'Cancel edit' : 'Edit meal'}
                              title={isEditing ? 'Cancel' : 'Edit meal'}
                            >✎</button>
                            {!isEditing && (
                              <button className="fs-log-delete" onClick={() => setConfirmDeleteMealId(meal.id)} aria-label="Delete saved meal">×</button>
                            )}
                          </div>
                        </div>
                      </div>

                      {confirmDeleteMealId === meal.id && (
                        <div className="fh-meal-delete-confirm">
                          <span className="fh-meal-delete-confirm-msg">Delete this meal?</span>
                          <button className="fh-meal-delete-confirm-yes" onClick={() => { handleDeleteSavedMeal(meal.id); setConfirmDeleteMealId(null) }}>Yes, delete</button>
                          <button className="fh-meal-delete-confirm-cancel" onClick={() => setConfirmDeleteMealId(null)}>Cancel</button>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="fh-meal-edit-section">
                          {editingItems.map(item => (
                            <div key={item._key} className="fh-meal-edit-item">
                              <div className="fh-meal-edit-item-row">
                                <div className="fh-meal-edit-item-info">
                                  <span className="fh-meal-edit-item-name">{item.food_name}</span>
                                  <div className="fh-meal-edit-serving-row">
                                    <input
                                      className="text-input text-input--narrow fh-meal-edit-qty"
                                      type="number" min="0.25" step="0.25"
                                      value={item.serving_size}
                                      onChange={e => updateEditItemQty(item._key, e.target.value)}
                                    />
                                    <span className="fh-meal-edit-unit">{item.serving_unit}</span>
                                  </div>
                                  <div className="fh-meal-edit-nutrients">
                                    {item._perUnit ? (
                                      <>Na {item._perUnit.sodium    != null ? Math.round(item._perUnit.sodium    * item.serving_size) : '—'}mg
                                      {' · '}K {item._perUnit.potassium != null ? Math.round(item._perUnit.potassium * item.serving_size) : '—'}mg
                                      {' · '}Mg {item._perUnit.magnesium != null ? Math.round(item._perUnit.magnesium * item.serving_size) : '—'}mg</>
                                    ) : (
                                      <>Na {item.sodium    != null ? Math.round(item.sodium)    : '—'}mg
                                      {' · '}K {item.potassium != null ? Math.round(item.potassium) : '—'}mg
                                      {' · '}Mg {item.magnesium != null ? Math.round(item.magnesium) : '—'}mg</>
                                    )}
                                  </div>
                                </div>
                                <div className="fh-meal-edit-item-actions">
                                  <button
                                    className="fh-meal-replace-btn"
                                    onClick={() => setReplacingItemKey(replacingItemKey === item._key ? null : item._key)}
                                  >
                                    {replacingItemKey === item._key ? 'Cancel' : 'Replace'}
                                  </button>
                                  <button className="fh-basket-remove" onClick={() => removeEditItem(item._key)} aria-label="Remove">×</button>
                                </div>
                              </div>

                              {replacingItemKey === item._key && (
                                <div className="fh-meal-replace-panel">
                                  <MealItemSearchPanel
                                    actionLabel="Replace item"
                                    onSelect={selected => { replaceEditItem(item._key, selected); setReplacingItemKey(null) }}
                                    onCancel={() => setReplacingItemKey(null)}
                                  />
                                </div>
                              )}
                            </div>
                          ))}

                          {replacingItemKey === 'new' ? (
                            <div className="fh-meal-replace-panel fh-meal-replace-panel--add">
                              <MealItemSearchPanel
                                actionLabel="Add to meal"
                                onSelect={selected => { addEditItem(selected); setReplacingItemKey(null) }}
                                onCancel={() => setReplacingItemKey(null)}
                              />
                            </div>
                          ) : (
                            <button className="fh-create-meal-btn fh-meal-add-item-btn" onClick={() => setReplacingItemKey('new')}>
                              + Add item
                            </button>
                          )}

                          <div className="fh-meal-edit-footer">
                            <button
                              className="btn-primary fh-meal-edit-save-btn"
                              onClick={() => handleMealEditSave(meal)}
                              disabled={mealSaving}
                            >
                              {mealSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button className="fs-cancel-btn" onClick={cancelEditMode}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <ul className="fh-my-meal-items">
                          {meal.items.map(item => (
                            <li key={item.id} className="fh-my-meal-item">{item.food_name}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
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
  const [confirmIsBeverage, setConfirmIsBeverage] = useState(false)

  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualSodium, setManualSodium] = useState('')
  const [manualPotassium, setManualPotassium] = useState('')
  const [manualMagnesium, setManualMagnesium] = useState('')

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
      const items = Array.isArray(data) ? data.slice(0, 10) : []
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
      console.log('portions API response', data)
      console.log('isBeverage:', data.isBeverage)
      const portionList = dedupePortions(data.portions ?? [])
      setConfirmPortions(portionList)
      setConfirmBasePer100g(data.basePer100g ?? null)
      setConfirmIsBeverage(data.isBeverage ?? false)
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

  function handleAddManualToMeal(e) {
    e.preventDefault()
    if (!manualName.trim()) return
    setMealBasket(prev => [...prev, {
      key: `manual-${Date.now()}`,
      food_name: manualName.trim(),
      fdc_id: null,
      default_serving_size: 1,
      sodium_mg_per_100g:    parseFloat(manualSodium)    || null,
      potassium_mg_per_100g: parseFloat(manualPotassium) || null,
      magnesium_mg_per_100g: parseFloat(manualMagnesium) || null,
      portionLabel: '1 srv',
    }])
    setManualName(''); setManualSodium(''); setManualPotassium(''); setManualMagnesium('')
    setShowManual(false)
  }

  async function handleSave() {
    if (!mealName.trim() || mealBasket.length === 0) return
    setSaving(true)
    try {
      const items = mealBasket.map(item => ({
        food_name: item.food_name,
        fdc_id: item.fdc_id ? String(parseInt(item.fdc_id)) : null,
        serving_size: item.default_serving_size,
        serving_unit: item.portionLabel,
        calories: null,
        sodium:    item.sodium_mg_per_100g    ?? null,
        potassium: item.potassium_mg_per_100g ?? null,
        magnesium: item.magnesium_mg_per_100g ?? null,
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
            onChange={e => { setQuery(e.target.value); setShowManual(false) }}
          />
          {query && !loading && (
            <button className="fs-clear" onClick={() => { setQuery(''); setResults([]); setSearchError(null); setConfirmingItem(null) }} aria-label="Clear">×</button>
          )}
        </div>
        <button className="fs-manual-link" onClick={() => { setShowManual(v => !v); setConfirmingItem(null) }}>
          {showManual ? '↑ Hide manual entry' : '+ Enter manually'}
        </button>

        {showManual && (
          <form className="fs-manual-form" onSubmit={handleAddManualToMeal}>
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
            </div>
            <div className="fs-confirm-actions">
              <button className="btn-primary" type="submit" disabled={!manualName.trim()}>
                + Add to meal
              </button>
              <button type="button" className="fs-cancel-btn" onClick={() => setShowManual(false)}>Cancel</button>
            </div>
          </form>
        )}

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
                                  {confirmPortions.map((p, i) => {
                                    const name = p.portionDescription || p.description || p.modifier || 'Serving'
                                    return (
                                      <option key={i} value={i}>
                                        {p.label === '100g'
                                          ? '100g'
                                          : `${name}${confirmIsBeverage && !name.includes('fl oz') ? ` (${gramsToFlOz(p.grams)} fl oz)` : ''} · ${p.grams}g`}
                                      </option>
                                    )
                                  })}
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

function MealItemSearchPanel({ onSelect, onCancel, actionLabel = 'Add to meal' }) {
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
  const [confirmIsBeverage, setConfirmIsBeverage] = useState(false)

  const [showManual, setShowManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualSodium, setManualSodium] = useState('')
  const [manualPotassium, setManualPotassium] = useState('')
  const [manualMagnesium, setManualMagnesium] = useState('')

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
      const items = Array.isArray(data) ? data.slice(0, 10) : []
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
      const portionList = dedupePortions(data.portions ?? [])
      setConfirmPortions(portionList)
      setConfirmBasePer100g(data.basePer100g ?? null)
      setConfirmIsBeverage(data.isBeverage ?? false)
      const defaultIdx = portionList.findIndex(p => p.label !== '100g')
      setConfirmPortionIdx(defaultIdx >= 0 ? defaultIdx : 0)
    } catch {
      setConfirmPortionsFailed(true)
      setConfirmGramsInput(100)
    } finally {
      setConfirmPortionsLoading(false)
    }
  }

  function handleConfirm() {
    if (!confirmingItem) return
    const grams = confirmPortionsFailed ? confirmGramsInput : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
    const qty   = confirmPortionsFailed ? 1 : confirmQuantity
    const portionLabel = confirmPortionsFailed
      ? `${grams}g`
      : (confirmPortions[confirmPortionIdx]?.label ?? '100g')
    const base = confirmBasePer100g ?? confirmingItem
    const baseSodium    = confirmPortionsFailed ? confirmingItem.sodium_mg    : base?.sodium_mg
    const basePotassium = confirmPortionsFailed ? confirmingItem.potassium_mg : base?.potassium_mg
    const baseMagnesium = confirmPortionsFailed ? confirmingItem.magnesium_mg : base?.magnesium_mg
    const sodiumPU    = calcMineral(baseSodium,    grams, 1)
    const potassiumPU = calcMineral(basePotassium, grams, 1)
    const magnesiumPU = calcMineral(baseMagnesium, grams, 1)
    onSelect({
      food_name: confirmingItem.description,
      fdc_id: confirmingItem.fdcId ?? null,
      serving_size: qty,
      serving_unit: portionLabel,
      sodium:    sodiumPU,
      potassium: potassiumPU,
      magnesium: magnesiumPU,
      calories: null,
      _perUnit: { sodium: sodiumPU, potassium: potassiumPU, magnesium: magnesiumPU },
    })
  }

  function handleManualConfirm(e) {
    e.preventDefault()
    if (!manualName.trim()) return
    const sod = parseFloat(manualSodium)    || null
    const pot = parseFloat(manualPotassium) || null
    const mag = parseFloat(manualMagnesium) || null
    onSelect({
      food_name: manualName.trim(),
      fdc_id: null,
      serving_size: 1,
      serving_unit: '1 srv',
      sodium: sod, potassium: pot, magnesium: mag, calories: null,
      _perUnit: { sodium: sod, potassium: pot, magnesium: mag },
    })
  }

  const confirmGrams = confirmPortionsFailed ? confirmGramsInput : (confirmPortions[confirmPortionIdx]?.grams ?? 100)
  const confirmBase  = confirmBasePer100g ?? confirmingItem
  const confirmSodium    = confirmingItem ? calcMineral(confirmBase?.sodium_mg,    confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmPotassium = confirmingItem ? calcMineral(confirmBase?.potassium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null
  const confirmMagnesium = confirmingItem ? calcMineral(confirmBase?.magnesium_mg, confirmGrams, confirmPortionsFailed ? 1 : confirmQuantity) : null

  return (
    <div className="fh-item-search-panel">
      <div className="fs-input-wrap">
        {loading && <span className="fs-spinner" />}
        <input
          className={`text-input fs-input${loading ? ' fs-input--loading' : ''}`}
          type="text"
          placeholder="Search foods…"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowManual(false) }}
          autoFocus
        />
        {query && !loading && (
          <button className="fs-clear" onClick={() => { setQuery(''); setResults([]); setSearchError(null); setConfirmingItem(null) }} aria-label="Clear">×</button>
        )}
      </div>

      <button className="fs-manual-link" onClick={() => { setShowManual(v => !v); setConfirmingItem(null) }}>
        {showManual ? '↑ Hide manual entry' : '+ Enter manually'}
      </button>

      {showManual && (
        <form className="fs-manual-form" onSubmit={handleManualConfirm}>
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
          </div>
          <div className="fs-confirm-actions">
            <button className="btn-primary" type="submit" disabled={!manualName.trim()}>{actionLabel}</button>
            <button type="button" className="fs-cancel-btn" onClick={() => setShowManual(false)}>Cancel</button>
          </div>
        </form>
      )}

      {searchError === 'unavailable' && <p className="inline-error">Food search unavailable</p>}
      {searchError === 'empty' && <p className="fs-empty">No results — try a more specific name</p>}

      {results.length > 0 && !showManual && (
        <ul className="fs-results fh-item-search-results">
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
                          <label className="fs-servings-label" htmlFor={`misp-${item.fdcId}`}>Quantity</label>
                          {confirmPortionsFailed ? (
                            <>
                              <input id={`misp-${item.fdcId}`} className="text-input text-input--narrow"
                                type="number" min="1" step="1" value={confirmGramsInput}
                                onChange={e => setConfirmGramsInput(Math.max(1, parseInt(e.target.value) || 100))} />
                              <span className="fs-serving-hint">g</span>
                            </>
                          ) : (
                            <>
                              <input id={`misp-${item.fdcId}`} className="text-input text-input--narrow"
                                type="number" min="0.25" step="0.25" value={confirmQuantity}
                                onChange={e => setConfirmQuantity(Math.max(0.25, parseFloat(e.target.value) || 1))} />
                              <select className="fs-portion-select" value={confirmPortionIdx}
                                onChange={e => setConfirmPortionIdx(parseInt(e.target.value))}>
                                {confirmPortions.map((p, i) => {
                                  const name = p.portionDescription || p.description || p.modifier || 'Serving'
                                  return (
                                    <option key={i} value={i}>
                                      {p.label === '100g' ? '100g'
                                        : `${name}${confirmIsBeverage && !name.includes('fl oz') ? ` (${gramsToFlOz(p.grams)} fl oz)` : ''} · ${p.grams}g`}
                                    </option>
                                  )
                                })}
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
                          <button className="btn-primary" onClick={handleConfirm}>{actionLabel}</button>
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

      <div className="fh-item-search-dismiss">
        <button className="fs-cancel-btn" onClick={onCancel}>↑ Close search</button>
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
  editIsBeverage,
  onEditManualQtyChange,
  editSaving, onEdit, onEditSave, onCancelEdit, onDelete,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
          <button className="fs-log-delete" onClick={() => setConfirmingDelete(true)} aria-label="Remove">×</button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="fh-meal-delete-confirm">
          <span className="fh-meal-delete-confirm-msg">Delete this item?</span>
          <button className="fh-meal-delete-confirm-yes" onClick={() => onDelete(entry.id)}>Yes, delete</button>
          <button className="fh-meal-delete-confirm-cancel" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </div>
      )}

      {editingId === entry.id && (
        <div className="fs-edit-panel">
          {editPortionsLoading ? (
            <div className="fs-confirm-loading">
              <span className="fs-spinner fs-spinner--inline" />
              <span className="fs-confirm-loading-text">Loading portions…</span>
            </div>
          ) : editPortions.length > 0 ? (
            <>
              <div className="fs-servings-row">
                <label className="fs-servings-label">Quantity</label>
                <input className="text-input text-input--narrow" type="number" min="0.25" step="0.25"
                  value={editQuantity}
                  onChange={e => onEditManualQtyChange(e.target.value)} />
                <select className="fs-portion-select" value={editPortionIdx}
                  onChange={e => setEditPortionIdx(parseInt(e.target.value))}>
                  {editPortions.map((p, i) => {
                    const name = p.portionDescription || p.description || p.modifier || 'Serving'
                    return (
                      <option key={i} value={i}>
                        {p.label === '100g'
                          ? '100g'
                          : `${name}${editIsBeverage && !name.includes('fl oz') ? ` (${gramsToFlOz(p.grams)} fl oz)` : ''} · ${p.grams}g`}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="fs-computed">
                <ComputedMineral label="Sodium"    value={editBasePer100g ? editComputedSodium    : (parseFloat(editSodium)    || null)} />
                <ComputedMineral label="Potassium" value={editBasePer100g ? editComputedPotassium : (parseFloat(editPotassium) || null)} />
                <ComputedMineral label="Magnesium" value={editBasePer100g ? editComputedMagnesium : (parseFloat(editMagnesium) || null)} />
              </div>
            </>
          ) : (
            <>
              <div className="fs-servings-row">
                <label className="fs-servings-label">Quantity</label>
                <input className="text-input text-input--narrow" type="number" min="0.25" step="0.25"
                  value={editQuantity}
                  onChange={e => onEditManualQtyChange(e.target.value)} />
              </div>
              <div className="fs-computed">
                <ComputedMineral label="Sodium"    value={parseFloat(editSodium)    || null} />
                <ComputedMineral label="Potassium" value={parseFloat(editPotassium) || null} />
                <ComputedMineral label="Magnesium" value={parseFloat(editMagnesium) || null} />
              </div>
            </>
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
  const [editingTotal, setEditingTotal] = useState(false)
  const [totalInput, setTotalInput] = useState('')
  const [savingTotal, setSavingTotal] = useState(false)

  useEffect(() => {
    setTodayOz(0)
    setEditingTotal(false)
    fetch(`/api/hydration?date=${selectedDate}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!Array.isArray(data)) return
        setTodayOz(data.reduce((sum, row) => sum + (row.water_oz ?? 0), 0))
      })
      .catch(() => {})
  }, [selectedDate])

  function openTotalEdit() {
    setTotalInput(String(Math.round(todayOz * 10) / 10))
    setEditingTotal(true)
  }

  async function handleTotalSave() {
    const oz = parseFloat(totalInput)
    if (isNaN(oz) || oz < 0) return
    setSavingTotal(true)
    try {
      await api.setHydrationTotal(oz, selectedDate)
      setTodayOz(oz)
      setEditingTotal(false)
    } finally {
      setSavingTotal(false)
    }
  }

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
      setInput(String(oz))
    } finally {
      setLogging(false)
    }
  }

  const pct = Math.min((todayOz / DAILY_GOAL_OZ) * 100, 100)
  const remaining = Math.max(DAILY_GOAL_OZ - todayOz, 0)
  const displayOz = Math.round(todayOz * 10) / 10

  return (
    <section className="fh-card fh-card--hydration">
      <h2 className="card-title">Hydration</h2>
      <p className="card-desc">Daily goal: {DAILY_GOAL_OZ} oz</p>

      <div className="hydration-display">
        <div className="hydration-numbers">
          {editingTotal ? (
            <>
              <input
                className="text-input hydration-total-input"
                type="number"
                min="0"
                max="500"
                step="0.5"
                value={totalInput}
                onChange={e => setTotalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTotalSave(); if (e.key === 'Escape') setEditingTotal(false) }}
                autoFocus
              />
              <button className="hydration-total-save" onClick={handleTotalSave} disabled={savingTotal} title="Save">✓</button>
              <button className="hydration-total-cancel" onClick={() => setEditingTotal(false)} disabled={savingTotal} title="Cancel">×</button>
            </>
          ) : (
            <button
              className="hydration-current hydration-current--editable"
              onClick={openTotalEdit}
              title="Edit total"
              disabled={savingTotal}
            >
              {displayOz}
            </button>
          )}
          <span className="hydration-sep">/</span>
          <span className="hydration-goal">{DAILY_GOAL_OZ}</span>
          <span className="hydration-unit">oz</span>
        </div>
        {remaining > 0 ? (
          <p className="hydration-remaining">{Math.round(remaining * 10) / 10} oz remaining</p>
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
