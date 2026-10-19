// Cart math shared by the cart and "Adjust leftovers". Pure: no storage.
// A cart item is { slug, servings, grams?, baseServings? }; grams holds per-serving grams that "Adjust leftovers"
// changed for this cart only (keyed by the plain food name). The saved meal never changes.
import { packRow } from "./packs";

export const norm = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// User prices (kept in the browser, lib/store.js) are per food key and pack weight, so one price serves every meal
// that buys that pack. Pack weight as the line shows it: grams per pack, for eggs units x 51 g, for loose items the unit.
export const priceKey = (food, packGrams) => `${norm(food)}|${Number(Number(packGrams).toFixed(3))}`;

// A meal with the user's prices on its lines (a typed price wins over one the engine sent, estimates included). Same
// meal back when no price applies.
export function withPrices(meal, prices) {
  if (!prices || !meal.lines.some((l) => l.priceKey && prices[l.priceKey] != null)) return meal;
  return { ...meal, lines: meal.lines.map((l) => (l.priceKey && prices[l.priceKey] != null
    ? { ...l, packPrice: prices[l.priceKey], hasPrice: true, estimate: false } : l)) };
}

// The prices the engine needs for one meal (evaluate.schema.json "prices"): every stored size of each food the
// meal buys, so the engine can pick among the sizes the user priced
export function pricesFor(meal, prices) {
  const foods = new Set(meal.lines.filter((l) => l.priceKey).map((l) => l.priceKey.split("|")[0]));
  return Object.entries(prices || {}).flatMap(([key, price]) => {
    const cut = key.lastIndexOf("|");
    const food = key.slice(0, cut);
    const grams = Number(key.slice(cut + 1));
    return foods.has(food) && grams > 0 ? [{ food, pack_grams: grams, price_eur: price }] : [];
  }).sort((a, b) => a.food.localeCompare(b.food) || a.pack_grams - b.pack_grams);
}

// The /api/evaluate request (lib/engine.js) that runs a saved meal again for some servings with the user's prices and
// country. The recipe page and the Cart both build it here, so the same meal, servings, prices and country always
// give the same packs, prices and estimates. The budget scales with the servings (the form's is for its own).
export function mealRequest(meal, servings, prices, country) {
  const form = meal.source.form;
  const budget = Math.round((form.budget_total_eur * servings / form.servings) * 100) / 100;
  return { form: { ...form, servings, budget_total_eur: Math.max(budget, 0.01) }, picked_idea: meal.idea,
    recipe: meal.source.recipe, prices: pricesFor(meal, prices), country: country || null };
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
