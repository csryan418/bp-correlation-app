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
  logHydration: (oz, date) =>
    request('/hydration', {
      method: 'POST',
      body: JSON.stringify({ oz, date }),
    }),
  oura: () => request('/oura/yesterday'),
  getSavedMeals: () => request('/saved-meals'),
  createSavedMeal: (name, items) =>
    request('/saved-meals', { method: 'POST', body: JSON.stringify({ name, items }) }),
  deleteSavedMeal: (id) => request(`/saved-meals/${id}`, { method: 'DELETE' }),
  getSupplements: () => request('/supplements'),
  createSupplement: (data) => request('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplement: (id, data) => request(`/supplements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupplement: (id) => request(`/supplements/${id}`, { method: 'DELETE' }),
  getSupplementLog: (date) => request(`/supplements/log?date=${date}`),
  logSupplement: (data) => request('/supplements/log', { method: 'POST', body: JSON.stringify(data) }),
}
