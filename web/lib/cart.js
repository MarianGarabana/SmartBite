// The cart, worked out in the browser from what lib/store.js keeps in localStorage. It starts empty.
// Entries are { slug, servings }; servings default to the meal's own.
// evaluated ({ entry ref: Meal }, components/Chrome.jsx useCart): each entry's meal run again by the engine for the
// entry's servings with the user's prices and country, the same evaluation the recipe page shows. Packs, estimates,
// totals and Adjust leftovers use it; an entry without one yet uses the saved meal.
import { applySuggestions, resetItems, suggest, summary } from "./adjust";
import { cartRows, itemMacros, mealOf, withPrices } from "./cartmath";
import { leftoverView } from "./leftovers";
import { totals } from "./packs";

// A stored entry as a cart item: servings default to the meal's own; adjustments kept when present
export function cartItem(e, meal) {
  return { slug: e.slug, servings: e.servings || meal.servings,
    ...(e.grams ? { grams: e.grams } : {}), ...(e.baseServings ? { baseServings: e.baseServings } : {}) };
}

// One ref per entry of a known meal: "<slug>#<n>" for its n-th entry, so it stays while servings change
function entryRefs(entries) {
  const seen = {};
  return entries.map((e) => `${e.slug}#${(seen[e.slug] = (seen[e.slug] || 0) + 1)}`);
}

// What the engine runs for the cart: [{ id: entry ref, meal: saved meal, servings }]
export function cartJobs(stored, allMeals) {
  const bySlug = Object.fromEntries(allMeals.map((m) => [m.slug, m]));
  const known = stored.meals.filter((e) => bySlug[e.slug] && bySlug[e.slug].source);
  const refs = entryRefs(known);
  return known.map((e, i) => ({ id: refs[i], meal: bySlug[e.slug], servings: cartItem(e, bySlug[e.slug]).servings }));
}

// Items of the known meals (with their ref when evaluated) and the meals by slug and by ref, with typed prices
function cartState(stored, allMeals, evaluated = {}) {
  const all = allMeals.map((m) => withPrices(m, stored.prices));
  const bySlug = Object.fromEntries(all.map((m) => [m.slug, m]));
  const known = stored.meals.filter((e) => bySlug[e.slug]);
  const unknown = stored.meals.filter((e) => !bySlug[e.slug]);
  const refs = entryRefs(known.filter((e) => bySlug[e.slug].source));
  let n = 0;
  const items = known.map((e) => {
    const item = cartItem(e, bySlug[e.slug]);
    const ref = bySlug[e.slug].source ? refs[n++] : null;
    if (!ref || !evaluated[ref]) return item;
    bySlug[ref] = withPrices(evaluated[ref], stored.prices);
    return { ...item, ref };
  });
  return { all, bySlug, items, unknown };
}

// A cart item as the stored entry: the ref is worked out again on every read
const toEntry = ({ ref: _ref, ...entry }) => entry;

// Same merge as the mockup: the same product across meals shares packs (lib/cartmath.js). Prices the user typed
// (stored.prices, per food and pack weight) price every meal's lines.
export function consolidate(stored, allMeals, evaluated = {}) {
  const { all, bySlug, items } = cartState(stored, allMeals, evaluated);
  const rows = cartRows(items, bySlug, new Set(stored.optional), new Set(stored.have));
  const meals = items.map((it) => ({ ...it, adjusted: !!(it.grams || it.baseServings), macros: itemMacros(mealOf(bySlug, it), it) }));
  return { meals, rows, totals: totals(rows),
    ...leftoverView(rows.filter((r) => !r.optional && !r.have), all, items.map((i) => i.slug)) };
}

// "Adjust leftovers to meals": products already at home count as optional and unticked here, so they are never
// bought, never waste and never adjusted. Entries of meals this page does not know (yet) stay in the cart untouched.
function adjustState(stored, all, evaluated) {
  const have = new Set(stored.have);
  const state = cartState(stored, all, evaluated);
  const bySlug = Object.fromEntries(Object.entries(state.bySlug).map(([k, m]) => [k,
    { ...m, lines: m.lines.map((l) => (have.has(l.key) ? { ...l, optional: true } : l)) }]));
  return { bySlug, items: state.items, unknown: state.unknown };
}

export function adjustInfo(stored, all, evaluated) {
  const { bySlug, items } = adjustState(stored, all, evaluated);
  const suggestions = suggest(items, bySlug);
  return { before: summary(items, bySlug), suggestions,
    after: summary(applySuggestions(items, suggestions, suggestions.map((s) => s.id)), bySlug) };
}

export function adjustPreview(stored, all, ids, evaluated) {
  const { bySlug, items } = adjustState(stored, all, evaluated);
  return summary(applySuggestions(items, suggest(items, bySlug), ids), bySlug);
}

// The stored cart with the chosen suggestions applied (recomputed here from the ids)
export function adjustApply(stored, all, ids, evaluated) {
  const { bySlug, items, unknown } = adjustState(stored, all, evaluated);
  return { ...stored, meals: [...applySuggestions(items, suggest(items, bySlug), ids).map(toEntry), ...unknown] };
}

// Undo every adjustment
export function adjustReset(stored, all, evaluated) {
  const { items, unknown } = adjustState(stored, all, evaluated);
  return { ...stored, meals: [...resetItems(items).map(toEntry), ...unknown] };
}
