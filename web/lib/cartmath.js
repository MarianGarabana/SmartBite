// Cart math shared by the cart and "Adjust leftovers". Pure: no storage.
// A cart item is { slug, servings, grams?, baseServings? }; grams holds per-serving grams that "Adjust leftovers"
// changed for this cart only (keyed by the plain food name). The saved meal never changes.
import { canonical } from "./names.js";
import { packRow } from "./packs.js";

export const norm = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Prices of the user's products (kept in the browser, lib/store.js) are per food key and pack weight, so one price
// serves every meal that buys that pack. Pack weight as the line shows it: grams per pack, for eggs units x 51 g, for loose items the unit.
export const EGG_GRAMS = 51; // size M, edible grams, as the engine counts eggs
export const priceKey = (food, packGrams) => `${norm(food)}|${Number(Number(packGrams).toFixed(3))}`;

// A meal with the user's prices on its lines (a typed price wins over one the engine sent, estimates included). Same
// meal back when no price applies.
export function withPrices(meal, prices) {
  if (!prices || !meal.lines.some((l) => l.priceKey && prices[l.priceKey] != null)) return meal;
  return { ...meal, lines: meal.lines.map((l) => (l.priceKey && prices[l.priceKey] != null
    ? { ...l, packPrice: prices[l.priceKey], hasPrice: true, estimate: false } : l)) };
}

// The products the engine needs for one recipe (evaluate.schema.json "products"): the user's product for each food
// the recipe uses (its English key, as the engine names it), from products = { food key: product } for their store
// (lib/store.js activeProducts). lines: the meal's shopping lines, whose food keys count too.
export function productsFor(recipe, products, lines = []) {
  const foods = new Set([...(recipe?.ingredients || []).map((i) => canonical(i.name)),
    ...lines.map((l) => l.foodKey)].filter(Boolean).map(norm));
  return Object.values(products || {}).filter((p) => foods.has(p.food)).sort((a, b) => a.food.localeCompare(b.food));
}

// The /api/evaluate request (lib/engine.js) that runs a saved meal again for some servings with the user's products
// and estimates ({ country, region }, lib/store.js engineEstimates). The recipe page and the Cart both build it here,
// so the same meal, servings, products and estimates always give the same packs and prices. The budget scales with
// the servings (the form's is for its own).
export function mealRequest(meal, servings, products, estimates) {
  const form = meal.source.form;
  const budget = Math.round((form.budget_total_eur * servings / form.servings) * 100) / 100;
  return { form: { ...form, servings, budget_total_eur: Math.max(budget, 0.01) }, picked_idea: meal.idea,
    recipe: meal.source.recipe, products: productsFor(meal.source.recipe, products, meal.lines),
    country: estimates?.country || null, ...(estimates?.country && estimates.region ? { region: estimates.region } : {}) };
}

// Grams of one line this cart item needs: the adjusted grams per serving if any, else the meal's own
export function lineNeeded(meal, line, item) {
  const g = item.grams?.[norm(line.food || line.ingredient)];
  return g != null ? g * item.servings : (line.needed * item.servings) / meal.servings;
}

// The meal a cart item uses: its engine evaluation (item.ref, lib/cart.js) when there is one, else the saved meal
export const mealOf = (bySlug, item) => (item.ref && bySlug[item.ref]) || bySlug[item.slug];

// Same merge as the mockup: lines with the same product key across meals share packs.
// ticked: optional product keys to buy; have: product keys already at home, flagged so totals and leftovers
// leave them out
export function cartRows(items, bySlug, ticked = new Set(), have = new Set()) {
  const merged = {};
  for (const item of items) {
    const meal = mealOf(bySlug, item);
    for (const l of meal.lines) {
      merged[l.key] ??= { line: l, needed: 0 };
      merged[l.key].needed += lineNeeded(meal, l, item);
    }
  }
  return Object.values(merged).map(({ line, needed }) => ({ ...packRow(line, needed), included: ticked.has(line.key),
    have: have.has(line.key) }));
}

// Per-serving macros of a cart item with its adjusted grams; null for meals without per-food nutrition
export function itemMacros(meal, item) {
  if (!meal.perServing || !meal.perGram) return null;
  const per = { ...meal.perServing };
  for (const [food, g] of Object.entries(item.grams || {})) {
    const own = meal.ingredients.find((i) => norm(i.food) === food);
    const pg = meal.perGram[food];
    if (!own || !pg) continue;
    for (const k of Object.keys(per)) per[k] += (g - own.grams) * pg[k];
  }
  return per;
}
