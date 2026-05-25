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

  return { portions, basePer100g };
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

  return { portions, basePer100g };
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

export async function searchFoods(foodName) {
  const res = await axios.get(`${BASE_URL}/foods/search`, {
    params: {
      query: foodName,
      api_key: process.env.USDA_API_KEY,
      pageSize: 5,
      dataType: 'Foundation,SR Legacy',
    },
  });

  const usdaResults = (res.data.foods ?? []).slice(0, 5).map(food => {
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
    };
  });

  if (usdaResults.length > 0) return usdaResults;
  return searchOpenFoodFacts(foodName);
}
