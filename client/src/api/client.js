const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  bloodPressure: () => request('/blood-pressure'),
  insights: () => request('/insights/correlations'),
  insightsFull: () => request('/insights/full'),
  health: () => request('/health'),
  searchFood: (name) =>
    request('/food/search', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  logFood: ({ fdcId, description, servings, sodium_mg, potassium_mg, magnesium_mg, date, meal_type, meal_id }) =>
    request('/food/log', {
      method: 'POST',
      body: JSON.stringify({ fdcId, description, servings, sodium_mg, potassium_mg, magnesium_mg, date, meal_type, meal_id }),
    }),
  getFoodLog: (date) => request(`/food/log?date=${date}`),
  getFoodPortions: (fdcId) => request(`/food/portions/${fdcId}`),
  updateFoodLog: (id, data) =>
    request(`/food/log/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteFoodLog: (id) => request(`/food/log/${id}`, { method: 'DELETE' }),
  copyMeal: (source_date, meal_type, target_date) =>
    request('/food/copy-meal', { method: 'POST', body: JSON.stringify({ source_date, meal_type, target_date }) }),
  logHydration: (oz, date) =>
    request('/hydration', {
      method: 'POST',
      body: JSON.stringify({ water_oz: oz, date }),
    }),
  setHydrationTotal: (oz, date) =>
    request('/hydration', {
      method: 'PUT',
      body: JSON.stringify({ water_oz: oz, date }),
    }),
  oura: () => request('/oura/yesterday'),
  getSavedMeals: () => request('/saved-meals'),
  createSavedMeal: (name, items) =>
    request('/saved-meals', { method: 'POST', body: JSON.stringify({ name, items }) }),
  deleteSavedMeal: (id) => request(`/saved-meals/${id}`, { method: 'DELETE' }),
  getMeals: () => request('/meals'),
  createMeal: (name, items) =>
    request('/meals', { method: 'POST', body: JSON.stringify({ name, items }) }),
  renameMeal: (id, name) =>
    request(`/meals/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteMeal: (id) => request(`/meals/${id}`, { method: 'DELETE' }),
  loadMeal: (id) => request(`/meals/${id}/load`, { method: 'POST' }),
  updateMealItem: (mealId, itemId, data) =>
    request(`/meals/${mealId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  addMealItem: (mealId, data) =>
    request(`/meals/${mealId}/items`, { method: 'POST', body: JSON.stringify(data) }),
  deleteMealItem: (mealId, itemId) =>
    request(`/meals/${mealId}/items/${itemId}`, { method: 'DELETE' }),
  getSupplements: () => request('/supplements'),
  createSupplement: (data) => request('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplement: (id, data) => request(`/supplements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupplement: (id) => request(`/supplements/${id}`, { method: 'DELETE' }),
  getSupplementLog: (date) => request(`/supplements/log?date=${date}`),
  logSupplement: (data) => request('/supplements/log', { method: 'POST', body: JSON.stringify(data) }),
  sleepTrends: () => request('/sleep/trends'),
  activityYesterday: () => request('/activity/yesterday'),
  getCheckinToday: () => request('/checkin/today'),
  saveCheckin: (data) =>
    request('/checkin', { method: 'POST', body: JSON.stringify(data) }),
}
