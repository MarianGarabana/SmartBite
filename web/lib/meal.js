// A Meal result ({form, picked_idea, recipe, evaluation: {pack, macros}}, docs/contracts/meal.schema.json) as the
// shape the pages use. Pure: runs on the server for demo meals and in the browser for meals made there.
import { norm, priceKey } from "./cartmath";
import { regionLabel } from "./store";

export const SLUG = /^[a-z0-9-]+$/;

// Lines with the same food and pack size share packs in the cart
const lineKey = (food, packSize) => `${norm(food)}|${packSize || 0}`;

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthText = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  return y && m >= 1 && m <= 12 ? `${MONTH[m - 1]} ${y}` : null;
};

// "2025-08/2026-07" (or from, to) as "Aug 2025 to Jul 2026"; null when it is not a period
export function periodText(from, to) {
  const [a, b] = to === undefined ? String(from || "").split("/") : [from, to];
  const [x, y] = [monthText(a), monthText(b)];
  return x && y ? `${x} to ${y}` : null;
}

// Where an estimated price comes from: the region's name (line price_region) or "Spain"
export const estimatePlace = (region) => regionLabel(region) || "Spain";

// Tooltip of an estimated price
export const estimateTitle = (period, region) =>
  `Estimated: ${estimatePlace(region)} average price paid, MAPA, ${periodText(period) || "latest 12 months"}`;

// Only a path on this site: no other host, no protocol-relative URL
const sitePhoto = (p) => typeof p === "string" && /^\/(?!\/)[\w\-./]+\.(jpe?g|png|webp)$/i.test(p);

export function toMeal(slug, doc, { kind = "demo", saved = false } = {}) {
  const ev = doc.evaluation;
  const per = ev.macros.per_serving;
  const servings = doc.form.servings;
  const all = doc.recipe.ingredients;
  const pantry = all.filter((it) => it.pantry);
  const item = (it) => ({ name: it.name, grams: it.grams_per_serving, food: it.name, dry: it.dry, note: it.note || null });
  // Where each food's macros come from: ciqual, usda, open_food_facts, or label (the user's product)
  const nutrition = Object.fromEntries((ev.macros.lines || []).filter((m) => m.food).map((m) => [norm(m.food), m.source]));
  return {
    slug,
    kind, // "demo": ships with the site; "local": made in this browser
    saved, // local meals show in My Recipes only after "Save in my recipes"
    fixture: !!doc.fixture, // hand-made test data, labelled on the page
    name: doc.recipe.title,
    date: doc.date || null,
    servings,
    time: doc.recipe.prep_time_min,
    steps: doc.recipe.steps || [],
    idea: doc.picked_idea || null,
    // What /api/evaluate needs to run this meal again with the user's prices
    source: { form: doc.form, recipe: doc.recipe },
    // For "Adjust leftovers": per-serving macros, targets, and nutrition per gram of each food
    perServing: { kcal: per.kcal, protein_g: per.protein_g, carbs_g: per.carbs_g, fat_g: per.fat_g },
    targets: { kcal: doc.form.kcal_target, protein: doc.form.protein_g_target, carbsMax: doc.form.carbs_g_max ?? null,
      fatMax: doc.form.fat_g_max ?? null },
    perGram: Object.fromEntries((ev.macros.lines || []).filter((m) => m.grams > 0).map((m) => [norm(m.name),
      Object.fromEntries(["kcal", "protein_g", "carbs_g", "fat_g"].map((k) => [k, m.amount[k] / m.grams]))])),
    kcal: Math.round(per.kcal),
    protein: Math.round(per.protein_g),
    macros: { kcal: `${Math.round(per.kcal)}`, protein: `${Math.round(per.protein_g)}g`,
      carbs: `${Math.round(per.carbs_g)}g`, fat: `${Math.round(per.fat_g)}g` },
    // Demo photo shipped with the site (a path under public/, e.g. /demo/images/<slug>.jpg); photos the user adds
    // stay in the browser (lib/photos.js) and win over it
    images: sitePhoto(doc.photo) ? [doc.photo] : [],
    aiPhoto: sitePhoto(doc.photo) && doc.photo_ai_generated === true, // labelled "AI-generated photo"
    photoPrompt: doc.picked_idea?.image_prompt || null, // copied into Gemini on the recipe page
    ingredients: all.filter((it) => !it.pantry).map(item),
    seasoning: pantry.length ? pantry.map((it) => it.name).join(", ") : null,
    pantryNote: "counted in the macros",
    // MyFitnessPal counts pantry items too
    mfpExtra: pantry.map(item),
    // Shared line shape (see lib/cart.js): needed grams for the meal's own servings, pack size, price if known
    lines: ev.pack.lines.map((l) => {
      const packSize = l.packs_to_buy ? l.grams_bought / l.packs_to_buy : null;
      const packPrice = packSize && l.cost_bought_eur != null ? l.cost_bought_eur / l.packs_to_buy : null;
      return {
        key: lineKey(l.ingredient, packSize),
        priceKey: packSize && l.food ? priceKey(l.food, packSize) : null, // English food key + pack weight
        foodKey: l.food || null, // English food key: a price typed here saves a product for it (lib/store.js)
        soldBy: l.sold_by || null,
        unitsPerPack: l.units_bought && l.packs_to_buy ? l.units_bought / l.packs_to_buy : null, // eggs per box
        userProduct: !!l.user_product, // from a product the user saved
        nutritionSource: (l.food && nutrition[norm(l.food)]) || null,
        priceDate: l.price_source === "user" ? l.price_date || null : null,
        ingredient: l.ingredient,
        food: l.ingredient,
        optional: !!l.optional, // spices, oil, sauces, juice: ticked in the cart
        needed: l.grams_needed,
        storage: l.storage,
        product: (l.product_name || "").replace(/[.\s]+$/, "") || null,
        packSize,
        packPrice,
        hasPrice: packPrice != null,
        // "estimate": a country's average price (engine, request with country); a typed price replaces it
        estimate: packPrice != null && l.price_source === "estimate",
        pricePeriod: l.price_period || null,
        priceRegion: l.price_region || null, // estimate from this region's average, else the country's
      };
    }),
  };
}

export function randomFive(meals) {
  const copy = [...meals];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 5);
}
