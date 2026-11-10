// A Meal result ({form, picked_idea, recipe, evaluation: {pack, macros}}, docs/contracts/meal.schema.json) as the
// shape the pages use. Pure: runs on the server for demo meals and in the browser for meals made there.
import { norm, priceKey } from "./cartmath";
import { COUNTRIES, ESTIMATES, readCountry, regionLabel } from "./store";

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

// Where an estimated price comes from: the region's name (line price_region) or the country's
export const estimatePlace = (region, country = readCountry()) =>
  regionLabel(region) || COUNTRIES.find((c) => c.id === country)?.label || country;

// "Canada average price paid, Statistics Canada, Sep 2025 to Aug 2026": an estimated price's source
export const estimateLabel = (period, region, country = readCountry()) => {
  const e = ESTIMATES[country] || ESTIMATES.ES;
  return `${estimatePlace(region, country)} ${e.kind}, ${e.source}, ${periodText(period) || "latest 12 months"}`;
};

// Tooltip of an estimated price
export const estimateTitle = (period, region, country) => `Estimated: ${estimateLabel(period, region, country)}`;

// Recipe categories come from the title, in code (no AI): breakfast foods make a Breakfast; any other meal is a
// Lunch and a Dinner, and a Salad or a Warm Meal. The first one is the label on the meal's card.
const BREAKFAST = /\b(oats|porridge|pancakes?|granola|muesli|toast|smoothie)\b/i;
export function categoriesOf(title) {
  if (BREAKFAST.test(title)) return ["Breakfast"];
  return [/\bsalad\b/i.test(title) ? "Salads" : "Warm Meals", "Lunch", "Dinner"];
}

// A demo meal as an idea card: name, macros and foods of the meal itself, not of the idea it started from
// (the recipe can drift from its idea when changes were asked)
export function demoIdea(meal) {
  const foods = meal.ingredients.map((it) => it.name);
  const list = foods.length > 1 ? `${foods.slice(0, -1).join(", ")} and ${foods.at(-1)}` : foods.join("");
  return {
    name: meal.name,
    one_line: `${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
    main_ingredients: foods,
    rough_macros: { ...meal.perServing },
  };
}

// Lower-case words of a text, without filler words of a craving
const FILLER = new Set(["with", "and", "the", "for", "some", "something", "want", "like", "meal", "meals", "food", "very"]);
const words = (text) => String(text || "").toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length > 2 && !FILLER.has(w));
// Same word, or one is the other plus an ending ("tomato", "tomatoes"); short words only when equal
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

// Demo mode picks: the demo meals closest to the craving first (a word in the name counts double, then foods and
// categories), none with a food the user does not want; ties keep the list order. Code only, no model.
export function demoPicks(meals, craving, exclude = [], count = 4) {
  const foods = (m) => [...m.ingredients, ...(m.pantryItems || [])].map((it) => it.name);
  const has = (list, w) => list.some((x) => sameWord(x, w));
  const wanted = words(craving);
  const allowed = meals.filter((m) => !exclude.some((food) => {
    const ws = words(food);
    return ws.length > 0 && foods(m).some((name) => ws.every((w) => has(words(name), w)));
  }));
  const score = (m) => {
    const name = words(m.name);
    const rest = [...foods(m).flatMap(words), ...(m.categories || []).flatMap(words)];
    return wanted.reduce((sum, w) => sum + (has(name, w) ? 2 : has(rest, w) ? 1 : 0), 0);
  };
  return (allowed.length ? allowed : meals).map((m) => [m, score(m)]).sort((a, b) => b[1] - a[1]).slice(0, count)
    .map(([m]) => m);
}

// Fiber per serving (evaluation.macros) as a tile: whole grams and % of 25 g a day; null when the meal has no fiber
export function fiberOf(macros) {
  const g = macros?.per_serving?.fiber_g;
  if (!Number.isFinite(g)) return null;
  return { grams: `${Math.round(g)}g`, pct: Number.isFinite(macros.fiber_pct) ? macros.fiber_pct : Math.round((g / 25) * 100) };
}

export const unitText = (unit) => (unit === "ug" ? "µg" : unit || "");

// 812 mg, 2.1 mg, 0.4 µg: whole numbers from 10 up, one decimal below; a trace under 0.05 is "<0.1", not 0
export function amountText(value, unit) {
  const n = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${n === 0 && value > 0 ? "<0.1" : n} ${unitText(unit)}`;
}

// Vitamins and minerals per serving (evaluation.macros.micros) as rows for the recipe page; null when the meal has
// none. bar: the % capped at 100 for the bar width. partial: some ingredients have no data for that nutrient.
export function microsOf(macros) {
  const m = macros?.micros;
  const rows = (Array.isArray(m?.nutrients) ? m.nutrients : [])
    .filter((n) => n?.label && Number.isFinite(n.per_serving) && Number.isFinite(n.pct))
    .map((n) => ({ key: n.key || n.label, label: n.label, amount: amountText(n.per_serving, n.unit), pct: n.pct,
      bar: Math.max(0, Math.min(100, n.pct)), partial: n.ingredients_with_data < n.ingredients_total }));
  if (!rows.length) return null;
  // The engine's count, unless rows were left out above
  const s = m.summary;
  const high = s?.count === rows.length && Number.isFinite(s.at_least_15pct) ? s.at_least_15pct
    : rows.filter((r) => r.pct >= 15).length;
  const c = m.coverage;
  const short = Number.isFinite(c?.with_data) && Number.isFinite(c?.total) && c.with_data < c.total;
  const missing = short && Array.isArray(c.missing) ? c.missing.filter(Boolean) : [];
  return {
    rows,
    summary: `At least 15% of the daily value for ${high} of ${rows.length} ${rows.length === 1 ? "nutrient" : "nutrients"}.`,
    coverage: short ? `Based on ${c.with_data} of ${c.total} ingredients.` : null,
    missing: missing.length ? `No data for ${missing.join(", ")}.` : null,
    partial: rows.some((r) => r.partial),
    reference: typeof m.reference === "string" && m.reference ? m.reference : null,
  };
}

// Only a path on this site: no other host, no protocol-relative URL
const sitePhoto = (p) => typeof p === "string" && /^\/(?!\/)[\w\-./]+\.(jpe?g|png|webp)$/i.test(p);

export function toMeal(slug, doc, { kind = "demo", saved = false } = {}) {
  const ev = doc.evaluation;
  const per = ev.macros.per_serving;
  const servings = doc.form.servings;
  const all = doc.recipe.ingredients;
  const pantry = all.filter((it) => it.pantry);
  // units: eggs per serving (the recipe contract counts only eggs in units), 0 for the rest
  const item = (it) => ({ name: it.name, grams: it.grams_per_serving, units: it.units_per_serving || 0, food: it.name, dry: it.dry,
    note: it.note || null });
  // Where each food's macros come from: ciqual, usda, open_food_facts, or label (the user's product)
  const nutrition = Object.fromEntries((ev.macros.lines || []).filter((m) => m.food).map((m) => [norm(m.food), m.source]));
  return {
    slug,
    kind, // "demo": ships with the site; "local": made in this browser
    saved, // local meals show in My Recipes only after "Save in my recipes"
    fixture: !!doc.fixture, // hand-made test data, labelled on the page
    shared: !!doc.shared, // opened from a shared link (lib/share.js), labelled "Shared recipe"
    imported: !!doc.imported, // read from a pasted recipe (lib/importer.js), labelled "Imported recipe"
    name: doc.recipe.title,
    categories: categoriesOf(doc.recipe.title),
    category: categoriesOf(doc.recipe.title)[0],
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
    // Per serving; null for meals made before fiber and vitamins were counted (the page hides them)
    fiber: fiberOf(ev.macros),
    micros: microsOf(ev.macros),
    // Demo photo shipped with the site (a path under public/, e.g. /demo/images/<slug>.jpg); photos the user adds
    // stay in the browser (lib/photos.js) and win over it
    images: sitePhoto(doc.photo) ? [doc.photo] : [],
    aiPhoto: sitePhoto(doc.photo) && doc.photo_ai_generated === true, // labelled "AI-generated photo"
    photoPrompt: doc.picked_idea?.image_prompt || null, // copied into Gemini on the recipe page
    ingredients: all.filter((it) => !it.pantry).map(item),
    seasoning: pantry.length ? pantry.map((it) => it.name).join(", ") : null,
    pantryNote: "counted in the macros",
    // Pantry items (spices, oil) as items too: their names count when matching a craving or a food to leave out
    pantryItems: pantry.map(item),
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

// Demo and real never mix (decided 2026-10-30): /demo has only the demo meals, the real app only the meals made in
// this browser. My Recipes lists every demo meal in the demo, and the meals the user saved in the real app.
export const modeMeals = (meals, demo) => meals.filter((m) => (demo ? m.kind === "demo" : m.kind === "local"));
export const recipeMeals = (meals, demo) => modeMeals(meals, demo).filter((m) => demo || m.saved);

export function randomFive(meals) {
  const copy = [...meals];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 5);
}

// Editing a meal by hand (decided 2026-11-09, components/MealEditor.jsx)
const EDIT_EGG_GRAMS = 51;
// Storage and dry weight of a food added by hand, from its name (the AI sets these for the foods it picks)
export function newIngredient(name, grams) {
  const n = String(name).toLowerCase();
  const eggs = /\begg/.test(n) && !/eggplant|white/.test(n);
  return {
    name: String(name).trim(),
    grams_per_serving: eggs ? Math.max(1, Math.round(grams / EDIT_EGG_GRAMS)) * EDIT_EGG_GRAMS : grams,
    units_per_serving: eggs ? Math.max(1, Math.round(grams / EDIT_EGG_GRAMS)) : 0,
    storage: /frozen/.test(n) ? "frozen" : /canned|dried|\bdry\b|rice|pasta|quinoa|couscous|oat|lentil|flour|nut|seed|oil|vinegar|sauce|spice|honey|jar/.test(n) ? "keeps" : "fresh",
    pantry: false,
    dry: /rice|pasta|quinoa|couscous/.test(n),
  };
}

// The recipe as edited: name, steps (one per line) and foods; grams per serving, eggs in units
export function editedRecipe(recipe, { title, stepsText, rows }) {
  return {
    ...recipe,
    title: title.trim(),
    steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean),
    ingredients: rows.map((r) => {
      if (r.isNew) return newIngredient(r.name, Number(r.amount));
      const units = r.units_per_serving ? Math.max(1, Math.round(Number(r.amount))) : 0;
      return { ...r.base, name: r.name.trim(), units_per_serving: units,
        grams_per_serving: units ? units * EDIT_EGG_GRAMS : Number(r.amount) };
    }),
  };
}

export function editProblem({ title, stepsText, rows }) {
  if (!title.trim()) return "Give the meal a name.";
  if (title.trim().length > 100) return "The name is too long (100 characters at most).";
  if (!stepsText.trim()) return "Add at least one step.";
  if (!rows.length) return "Keep at least one food.";
  if (rows.some((r) => !r.name.trim())) return "Every food needs a name.";
  if (rows.some((r) => !(Number(r.amount) > 0))) return "Every food needs grams above 0 (eggs: at least 1).";
  return "";
}

