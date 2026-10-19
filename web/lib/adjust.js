// "Adjust leftovers to meals": code-only suggestions that cut what the cart meals leave over.
// 1. Grams (foods with nutrition per gram, with the meal's own targets): per product with leftovers, cut grams
//    up to 15% when that saves a whole pack, else raise them up to 15% to use the rest. Protein stays at or above
//    90% of the target, kcal within 10% of it, fat and carbs under their max.
// 2. Servings, for what is still left: try a few servings per meal (1 to 8) and keep the mix that leaves least.
// 0. Fit whole packs, before 1 and 2: the meal's main protein (e.g. a 130 g tuna can) does
//    not have to be one pack per serving. Try 1 to 8 servings with grams that fill whole packs (5 cans for 7
//    servings), cutting past 15% only while protein stays at or above the target (kcal, fat, carbs as in 1).
// Changes live in the cart only.
// Pure: no storage. Food that spoils counts in full; food that keeps counts a quarter.
import { cartRows, itemMacros, mealOf, norm } from "./cartmath";
import { totals } from "./packs";

// Eggs are bought in units, so their grams are never adjusted
const isEgg = (food) => /^(huevos?|eggs?)\b/.test(food);
// Lines without a price still count their leftover grams, at this stand-in cost per gram (about 2.50 per 500 g)
const UNPRICED_PER_GRAM = 0.005;
const leftValue = (r) => r.leftCost ?? r.left * UNPRICED_PER_GRAM;

const MAX_CHANGE = 0.15;
const CHANGE_COST = 0.3; // cost-like penalty per serving changed, so small gains do not reshuffle the plan
const MIN_GAIN = 0.5;
const round5 = (g) => Math.round(g / 5) * 5;

export function wasteScore(rows) {
  return rows.filter((r) => !r.optional && r.packSize && r.left > 0)
    .reduce((s, r) => s + leftValue(r) * (r.storage === "fresh" ? 1 : 0.25), 0);
}

export function summary(items, bySlug) {
  const rows = cartRows(items, bySlug);
  const t = totals(rows);
  return { leftCost: t.wasteCost, wasteGrams: t.wasteGrams, bought: t.bought, priced: t.priced, score: wasteScore(rows) };
}

function bestServings(items, bySlug, locked = new Set()) {
  const wide = items.length <= 5;
  const options = items.map(({ servings: s }, i) => (locked.has(i) ? [s]
    : (wide ? [s - 1, s, s + 1, s + 2] : [s - 1, s, s + 1]).filter((n) => n >= 1 && n <= 8)));
  const base = wasteScore(cartRows(items, bySlug));
  let best = { score: base, combo: items.map((i) => i.servings) };
  const walk = (i, combo) => {
    if (i === items.length) {
      const moved = combo.reduce((s, n, k) => s + Math.abs(n - items[k].servings), 0);
      if (!moved) return;
      const waste = wasteScore(cartRows(items.map((it, k) => ({ ...it, servings: combo[k] })), bySlug));
      if (waste + CHANGE_COST * moved < best.score) best = { score: waste + CHANGE_COST * moved, waste, combo: [...combo] };
      return;
    }
    for (const n of options[i]) walk(i + 1, [...combo, n]);
  };
  walk(0, []);
  return best.waste != null && base - best.waste >= MIN_GAIN ? best.combo : null;
}

function macrosOk(meal, macros, minProtein = 0.9) {
  const t = meal.targets || {};
  return (!t.protein || macros.protein_g >= minProtein * t.protein) && (!t.kcal || Math.abs(macros.kcal - t.kcal) <= 0.1 * t.kcal)
    && (t.fatMax == null || macros.fat_g <= t.fatMax) && (t.carbsMax == null || macros.carbs_g <= t.carbsMax);
}

// Spread a gram change (total grams, + to use up, - to cut) over the meals using one product, within +-15%
function spread(users, delta) {
  const cap = (u) => Math.max(0, (delta > 0 ? u.own * (1 + MAX_CHANGE) - u.cur : u.cur - u.own * (1 - MAX_CHANGE)) * u.item.servings);
  const total = users.reduce((s, u) => s + cap(u), 0);
  if (total <= 0) return [];
  const frac = Math.min(1, Math.abs(delta) / total);
  return users.map((u) => {
    let to = u.cur + Math.sign(delta) * (frac * cap(u)) / u.item.servings;
    to = delta < 0 ? Math.max(Math.ceil(u.own * (1 - MAX_CHANGE) / 5) * 5, Math.floor(to / 5) * 5)
      : Math.min(Math.floor(u.own * (1 + MAX_CHANGE) / 5) * 5, round5(to));
    return { ...u, to };
  }).filter((u) => u.to !== round5(u.cur) && u.to !== u.cur);
}

// The food that gives the meal most protein, if it is bought in packs (null for recipes without per-food nutrition)
function mainProtein(meal) {
  if (!meal.perGram || !meal.targets?.protein) return null;
  let best = null;
  for (const l of meal.lines) {
    const food = norm(l.food);
    if (l.optional || !l.packSize || isEgg(food) || !meal.perGram[food]) continue;
    const own = meal.ingredients.find((i) => norm(i.food) === food)?.grams ?? l.needed / meal.servings;
    const protein = own * meal.perGram[food].protein_g;
    if (!best || protein > best.protein) best = { line: l, food, own, protein };
  }
  return best;
}

function fitSuggestions(items, bySlug) {
  const out = [];
  let state = items;
  items.forEach((item, idx) => {
    const meal = mealOf(bySlug, item);
    const main = mainProtein(meal);
    if (!main) return;
    const { line, food, own } = main;
    const cur = item.grams?.[food] ?? own;
    const score = (next, moved) => wasteScore(cartRows(next, bySlug)) + CHANGE_COST * moved;
    let best = { score: score(state, 0) - MIN_GAIN };
    for (let n = 1; n <= 8; n++) {
      for (let k = 1; k * line.packSize <= n * own * (1 + MAX_CHANGE); k++) {
        const g = Math.floor((k * line.packSize) / n); // round down: n x g never needs one more pack
        // same grams is a plain servings change: step 2 handles that
        if (g === Math.round(cur) || g > own * (1 + MAX_CHANGE)) continue;
        const next = state.map((it, i) => (i === idx ? { ...it, servings: n, grams: { ...(it.grams || {}), [food]: g } } : it));
        if (!macrosOk(meal, itemMacros(meal, next[idx]), 1)) continue;
        const s = score(next, Math.abs(n - item.servings));
        if (s < best.score) best = { score: s, n, g, k, next };
      }
    }
    if (best.n == null) return;
    out.push({ id: `fit:${idx}:${best.n}:${best.g}`, kind: "fit", idx, meal: meal.name, ingredient: line.ingredient, food,
      packs: best.k, from: item.servings, to: best.n, gramsFrom: Math.round(cur), gramsTo: best.g, own: Math.round(own) });
    state = best.next;
  });
  return { suggestions: out, state };
}

function applyFit(items, s) {
  return items.map((it, i) => (i === s.idx ? { ...it, baseServings: it.baseServings || it.servings, servings: s.to,
    grams: { ...(it.grams || {}), [s.food]: s.gramsTo } } : it));
}

function gramSuggestions(items, bySlug, skip = new Set()) {
  const out = [];
  for (const r of cartRows(items, bySlug)) {
    if (r.optional || !r.packSize || r.left <= 0) continue;
    const users = items.flatMap((item, idx) => {
      const meal = mealOf(bySlug, item);
      if (!meal.perGram) return [];
      return meal.lines.filter((l) => l.key === r.key && !l.optional && !isEgg(norm(l.food))
        && meal.perGram[norm(l.food)] && !skip.has(`${idx}:${norm(l.food)}`)).map((l) => {
        const food = norm(l.food);
        const own = meal.ingredients.find((i) => norm(i.food) === food)?.grams ?? l.needed / meal.servings;
        return { item, idx, meal, food, own, cur: item.grams?.[food] ?? own };
      });
    });
    if (!users.length) continue;
    const before = wasteScore(cartRows(items, bySlug)) + 0.01 * summary(items, bySlug).bought;
    const tryChange = (delta) => {
      const changes = spread(users, delta).filter((u) =>
        macrosOk(u.meal, itemMacros(u.meal, { ...u.item, grams: { ...(u.item.grams || {}), [u.food]: u.to } })));
      if (!changes.length) return null;
      const next = applyGrams(items, changes);
      const after = wasteScore(cartRows(next, bySlug)) + 0.01 * summary(next, bySlug).bought;
      return after < before - 0.05 ? changes : null;
    };
    const cutToFewerPacks = r.packs >= 2 ? r.needed - (r.packs - 1) * r.packSize : 0;
    const changes = (cutToFewerPacks > 0 && tryChange(-cutToFewerPacks)) || tryChange(r.left);
    if (changes) out.push({ key: r.key, ingredient: r.ingredient, changes });
  }
  return out;
}

function applyGrams(items, changes) {
  const next = items.map((it) => ({ ...it, grams: it.grams ? { ...it.grams } : undefined }));
  for (const c of changes) next[c.idx].grams = { ...(next[c.idx].grams || {}), [c.food]: c.to };
  return next.map((it) => (it.grams ? it : (({ grams, ...rest }) => rest)(it)));
}

// Suggestions with stable ids: they are recomputed on apply, so the preview only keeps ids.
// Fitting whole packs of the main protein comes first, then small gram changes (all meals stay); servings
// only for what is still left after them. A fitted meal keeps its new servings and protein grams.
export function suggest(items, bySlug) {
  const fit = fitSuggestions(items, bySlug);
  const suggestions = [...fit.suggestions];
  let state = fit.state;
  const fitted = new Set(fit.suggestions.map((s) => `${s.idx}:${s.food}`));
  for (const g of gramSuggestions(state, bySlug, fitted)) {
    suggestions.push({ id: `grams:${g.key}`, kind: "grams", ingredient: g.ingredient,
      changes: g.changes.map((c) => ({ idx: c.idx, meal: c.meal.name, food: c.food, from: Math.round(c.cur), to: c.to, own: Math.round(c.own) })) });
    state = applyGrams(state, g.changes);
  }
  const combo = bestServings(state, bySlug, new Set(fit.suggestions.map((s) => s.idx)));
  if (combo) combo.forEach((to, idx) => {
    if (to !== state[idx].servings) suggestions.push({ id: `servings:${idx}:${to}`, kind: "servings", idx,
      meal: mealOf(bySlug, state[idx]).name, from: state[idx].servings, to });
  });
  return suggestions;
}

export function applySuggestions(items, suggestions, ids) {
  const pick = new Set(ids);
  let next = items.map((it) => ({ ...it }));
  for (const s of suggestions.filter((x) => pick.has(x.id))) {
    if (s.kind === "servings") {
      next[s.idx] = { ...next[s.idx], baseServings: next[s.idx].baseServings || items[s.idx].servings, servings: s.to };
    } else if (s.kind === "fit") {
      next = applyFit(next, s);
    } else {
      next = applyGrams(next, s.changes);
    }
  }
  return next;
}

// Undo every adjustment: servings back to what they were, grams back to the saved meal
export function resetItems(items) {
  return items.map(({ grams, baseServings, ...it }) => ({ ...it, servings: baseServings || it.servings }));
}
