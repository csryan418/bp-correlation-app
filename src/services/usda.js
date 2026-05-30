import axios from 'axios';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const OFF_BASE_URL = 'https://world.openfoodfacts.org';

function normalizeOffProduct(product) {
  const n = product.nutriments ?? {};
  return {
    fdcId: `off_${product.code}`,
    description: product.product_name || 'Unknown product',
    sodium_mg:    n.sodium_100g    != null ? n.sodium_100g    * 1000 : null,
    potassium_mg: n.potassium_100g != null ? n.potassium_100g * 1000 : null,
    magnesium_mg: n.magnesium_100g != null ? n.magnesium_100g * 1000 : null,
    source: 'openfoodfacts',
  };
}

async function searchOpenFoodFacts(query) {
  const res = await axios.get(`${OFF_BASE_URL}/cgi/search.pl`, {
    params: {
      search_terms: query,
      search_simple: 1,
      action: 'process',
      json: 1,
      fields: 'code,product_name,nutriments,serving_size',
      page_size: 5,
      countries_tags: 'united-states',
    },
  });
  return (res.data.products ?? []).slice(0, 5).map(normalizeOffProduct);
}

export async function getOpenFoodFactsPortions(offId) {
  const code = offId.slice('off_'.length);
  const res = await axios.get(`${OFF_BASE_URL}/api/v0/product/${code}.json`, {
    params: { fields: 'product_name,nutriments,serving_size' },
  });

  const product = res.data.product ?? {};
  const n = product.nutriments ?? {};

  const portions = [];
  const servingStr = product.serving_size;
  if (servingStr) {
    const gramsMatch = servingStr.match(/(\d+(?:\.\d+)?)\s*g/i);
    portions.push({ label: servingStr, grams: gramsMatch ? parseFloat(gramsMatch[1]) : 100 });
  }
  portions.push({ label: '100g', grams: 100 });

  const basePer100g = {
    sodium_mg:    n.sodium_100g    != null ? n.sodium_100g    * 1000 : null,
    potassium_mg: n.potassium_100g != null ? n.potassium_100g * 1000 : null,
    magnesium_mg: n.magnesium_100g != null ? n.magnesium_100g * 1000 : null,
  };

  return { portions, basePer100g, isBeverage: false };
}

export async function getFoodPortions(fdcId) {
  const res = await axios.get(`${BASE_URL}/food/${fdcId}`, {
    params: { api_key: process.env.USDA_API_KEY },
  });

  const data = res.data;
  const foodPortions = data.foodPortions ?? [];
  const portions = foodPortions
    .filter(p => p.gramWeight != null && p.gramWeight > 0)
    .map(p => ({
      label: [p.amount != null ? String(p.amount) : null, p.modifier]
        .filter(Boolean)
        .join(' '),
      grams: p.gramWeight,
      portionDescription: p.portionDescription ?? null,
      description: p.description ?? null,
      modifier: p.modifier ?? null,
    }));

  portions.push({ label: '100g', grams: 100 });

  // Extract per-100g nutrient values from the detail response
  const nutrients = data.foodNutrients ?? [];
  const getNutrient = (id) =>
    nutrients.find(n => (n.nutrient?.id ?? n.nutrientId) === id)?.amount ?? null;

  const basePer100g = {
    sodium_mg:    getNutrient(1093),
    potassium_mg: getNutrient(1092),
    magnesium_mg: getNutrient(1090),
  };

  const beverageNameKeywords = /coffee|latte|espresso|cappuccino|americano|macchiato|mocha|chai|matcha|smoothie|juice|shake|milkshake/i
  const isBeverage =
    /beverage|coffee|tea|juice|soft drink|soda|water|milk|dairy drink/i.test(data.foodCategory?.description ?? '') ||
    beverageNameKeywords.test(data.description ?? '')

  return { portions, basePer100g, isBeverage };
}

// Stable USDA nutrient IDs (per 100g for Foundation/SR Legacy foods)
const NUTRIENT_IDS = {
  calories:     1008, // Energy, kcal
  sodium_mg:    1093, // Sodium, Na
  potassium_mg: 1092, // Potassium, K
  magnesium_mg: 1090, // Magnesium, Mg
};

export async function lookupNutrients(foodName) {
  const res = await axios.get(`${BASE_URL}/foods/search`, {
    params: {
      query: foodName,
      api_key: process.env.USDA_API_KEY,
      pageSize: 5,
      dataType: 'Foundation,SR Legacy',
    },
  });

  const food = res.data.foods?.[0];
  if (!food) return null;

  const nutrients = {};
  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const match = food.foodNutrients.find(n => n.nutrientId === id);
    nutrients[key] = match?.value ?? null;
  }

  return { fdcId: food.fdcId, description: food.description, nutrients };
}

const WHOLE_FOOD_TYPES = new Set(['Foundation', 'SR Legacy']);

async function searchUSDA(foodName) {
  const commonParams = {
    query: foodName,
    api_key: process.env.USDA_API_KEY,
    sortBy: 'score',
    sortOrder: 'desc',
  };

  const [wholeRes, broadRes] = await Promise.all([
    axios.get(`${BASE_URL}/foods/search`, { params: { ...commonParams, pageSize: 5, dataType: 'Foundation,SR Legacy' } }),
    axios.get(`${BASE_URL}/foods/search`, { params: { ...commonParams, pageSize: 3 } }),
  ]);

  const seen = new Set();
  const merged = [];
  for (const food of [...(wholeRes.data.foods ?? []), ...(broadRes.data.foods ?? [])]) {
    if (!seen.has(food.fdcId)) {
      seen.add(food.fdcId);
      merged.push(food);
    }
  }

  const foods = merged
    .sort((a, b) => {
      const aWhole = WHOLE_FOOD_TYPES.has(a.dataType);
      const bWhole = WHOLE_FOOD_TYPES.has(b.dataType);
      if (aWhole && !bWhole) return -1;
      if (!aWhole && bWhole) return 1;
      return 0;
    })
    .slice(0, 5);

  return foods.map(food => {
    const getNutrient = (id) =>
      food.foodNutrients.find(n => n.nutrientId === id)?.value ?? null;

    return {
      fdcId: food.fdcId,
      description: food.description,
      sodium_mg:    getNutrient(NUTRIENT_IDS.sodium_mg),
      potassium_mg: getNutrient(NUTRIENT_IDS.potassium_mg),
      magnesium_mg: getNutrient(NUTRIENT_IDS.magnesium_mg),
      serving_size: food.servingSize ?? 100,
      serving_unit: food.servingSizeUnit ?? 'g',
      source: 'usda',
    };
  });
}

export async function searchFoods(foodName) {
  const [usdaOutcome, offOutcome] = await Promise.allSettled([
    searchUSDA(foodName),
    searchOpenFoodFacts(foodName),
  ]);

  const usdaResults = usdaOutcome.status === 'fulfilled' ? usdaOutcome.value : [];
  const offResults  = offOutcome.status  === 'fulfilled' ? offOutcome.value  : [];

  const maxLen = Math.max(usdaResults.length, offResults.length);
  const interleaved = [];
  for (let i = 0; i < maxLen; i++) {
    if (i < usdaResults.length) interleaved.push(usdaResults[i]);
    if (i < offResults.length)  interleaved.push(offResults[i]);
  }

  const hasNutrients = (item) =>
    item.sodium_mg != null || item.potassium_mg != null || item.magnesium_mg != null;

  const queryLower = foodName.toLowerCase();
  const isRelevant = (item) => {
    const d = item.description.toLowerCase();
    return d === queryLower || d.startsWith(queryLower);
  };

  return interleaved
    .filter(hasNutrients)
    .sort((a, b) => {
      const aMatch = isRelevant(a);
      const bMatch = isRelevant(b);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
}
