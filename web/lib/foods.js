// My Day food picker (decided 2026-11-21): add one food to the day by name and grams, no macros typed by hand.
// Foods: every record of data/open/nutrition/per-100g.json (copied to generated/food-table.js before build and loaded
// only when the picker opens), found by their English key or any other name in data/open/aliases.json (Spanish names,
// plurals, no accents). Also the user's saved products that have a label. Pure: no storage, no server, no AI.
// The math is the engine's (smartbite_engine/calc.py scale): value per 100 g x (grams / 100). Eggs are counted in
// units of edible grams by size (S 42, M 51, L 60, XL 69); a label value the product lacks (fiber) comes from the
// food's table record, like smartbite_engine/meal.py _label_macros. Vitamins and minerals scale the same way
// (smartbite_engine/nutrition.py scale_micros); a value the source does not have stays unknown, never 0.
import { ALIASES } from "../generated/index.js";
import { MICROS } from "./day";
import { foodName, t } from "./i18n";
import { FOODS_ES } from "./i18n/foods-es";
import { FOODS_ES_MX } from "./i18n/foods-es-MX";
import { canonical, plain, singular, words } from "./names";

export const EGGS = "eggs"; // smartbite_engine/meal.py EGGS
export const EGG_GRAMS = { S: 42, M: 51, L: 60, XL: 69 }; // smartbite_engine/calc.py EGG_GRAMS
export const EGG_SIZE = "M"; // the engine's size everywhere (smartbite_engine/pack.py EGG_SIZE)
export const MAX_FOOD_GRAMS = 2000;
export const MAX_EGGS = 12;
const MAX_NAME = 60; // lib/day.js MAX_NAME: longer names are cut there
const MACRO_FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"];
export const MICRO_KEYS = MICROS.map(([k]) => k);
// The columns of generated/food-table.js, in order (scripts/copy-prompts.mjs FOOD_FIELDS)
export const FIELDS = [...MACRO_FIELDS, ...MICRO_KEYS];

// { food key: [one value per FIELDS, null when unknown] } per 100 g, fetched on first call (its own chunk)
export const loadFoodTable = () => import("../generated/food-table.js").then((m) => m.FOOD_TABLE);

const per100 = (row) => Object.fromEntries(FIELDS.map((k, i) => [k, row[i] ?? null]));

// The table record of a food, like smartbite_engine/nutrition.py find: its name as written, else its English key
export function findFood(food, table, aliases = ALIASES) {
  const row = table[plain(food)] ?? table[canonical(food, aliases)];
  return row ? per100(row) : null;
}

// Per 100 g of a saved product's label; a value the label leaves out (fiber, vitamins, minerals) comes from the food's
// table record, null when neither has it (fiber then counts as 0 like in the engine; a micro stays unknown)
export function labelPer100(product, table, aliases = ALIASES) {
  const label = product.per_100g;
  const record = findFood(product.food, table, aliases);
  const rest = Object.fromEntries(["fiber_g", ...MICRO_KEYS].map((k) => [k, label[k] ?? record?.[k] ?? null]));
  return { kcal: label.kcal, protein_g: label.protein_g, carbs_g: label.carbs_g, fat_g: label.fat_g, ...rest };
}

// Other names per food key: aliases.json ("aliases" and "more_aliases": "durazno", "miel"), then the Spanish names
// the site shows (lib/i18n/foods-es.js, and Mexico's: "chícharos", "calabacita")
function otherNames(aliases) {
  const out = new Map();
  const add = (name, key) => {
    if (!out.has(key)) out.set(key, []);
    if (!out.get(key).includes(name)) out.get(key).push(name);
  };
  for (const [name, key] of Object.entries({ ...(aliases.more_aliases || {}), ...(aliases.aliases || {}) })) add(name, key);
  for (const names of [FOODS_ES, FOODS_ES_MX]) for (const [key, name] of Object.entries(names)) add(name, key);
  return out;
}

const tokens = (text) => words(text).map(singular);
const asName = (text) => ({ text, plain: plain(text), tokens: tokens(text) });
const nameCache = new WeakMap();
function foodEntries(table, aliases) {
  let byAliases = nameCache.get(table);
  if (!byAliases) nameCache.set(table, (byAliases = new WeakMap()));
  if (byAliases.has(aliases)) return byAliases.get(aliases);
  const others = otherNames(aliases);
  const entries = Object.keys(table).sort().map((key) => ({
    id: `food:${key}`, kind: "food", food: key, name: key, names: [key, ...(others.get(key) || [])].map(asName),
    per100: per100(table[key]), eggs: key === EGGS,
  }));
  byAliases.set(aliases, entries);
  return entries;
}

function productEntries(products, table, aliases) {
  const others = otherNames(aliases);
  return Object.values(products || {}).filter((p) => p && p.per_100g && typeof p.food === "string" && typeof p.name === "string")
    .map((p) => ({
      id: `product:${p.food}`, kind: "product", food: p.food, name: p.name,
      names: [p.name, p.food, ...(others.get(p.food) || [])].map(asName),
      per100: labelPer100(p, table, aliases), eggs: p.food === EGGS,
    }));
}

// 0: the query is this food's name (any spelling, plural or accent), 1: a name starts with the query, 2: every query
// word starts a word of one name; null: no match
function score(entry, query, queryTokens, exactKey) {
  if (exactKey && entry.food === exactKey) {
    const same = queryTokens.join(" ");
    return { rank: 0, via: entry.names.find((n) => n.plain === query) || entry.names.find((n) => n.tokens.join(" ") === same)
      || null };
  }
  let best = null;
  for (const n of entry.names) {
    let rank = null;
    if (n.plain === query) rank = 0;
    else if (n.plain.startsWith(query)) rank = 1;
    else if (queryTokens.length && queryTokens.every((q) => n.tokens.some((t) => t.startsWith(q)))) rank = 2;
    if (rank !== null && (!best || rank < best.rank)) best = { rank, via: n };
  }
  return best;
}

// The picker's list for a search: { id, kind ("food" | "product"), food, name, alt, per100, eggs }. alt: the name the
// search matched when it is not the shown one (e.g. "guisantes" for frozen peas). Best match first; the user's
// products before table foods on a tie, then A to Z. An empty search lists the products, then every food.
export function searchFoods(query, { table, products = {}, aliases = ALIASES, limit = 200 } = {}) {
  if (!table) return [];
  const all = [...productEntries(products, table, aliases), ...foodEntries(table, aliases)];
  const q = plain(query);
  const qTokens = tokens(query);
  const clean = (e, via) => ({ id: e.id, kind: e.kind, food: e.food, name: e.name, per100: e.per100, eggs: e.eggs,
    alt: via && via.plain !== plain(e.name) ? via.text : null });
  if (!q) return all.map((e) => clean(e, null)); // the whole list: limit is for searches only
  const exactKey = canonical(query, aliases);
  const found = [];
  for (const e of all) {
    const s = score(e, q, qTokens, exactKey);
    if (s) found.push({ e, s });
  }
  found.sort((a, b) => a.s.rank - b.s.rank || (a.e.kind === b.e.kind ? 0 : a.e.kind === "product" ? -1 : 1)
    || (a.e.name < b.e.name ? -1 : a.e.name > b.e.name ? 1 : 0));
  return found.slice(0, limit).map(({ e, s }) => clean(e, s.via));
}

// The amount as typed: grams (a comma works as the decimal point, more than 0 and at most 2000), or for eggs a whole
// number of eggs from 1 to 12. { ok, value } or { ok: false, error: "empty" | "grams" | "eggs" }
export function readAmount(text, eggs = false) {
  const t = text === null || text === undefined ? "" : String(text).trim();
  if (!t) return { ok: false, error: "empty" };
  const n = Number(t.replace(",", "."));
  if (eggs) return Number.isInteger(n) && n >= 1 && n <= MAX_EGGS ? { ok: true, value: n } : { ok: false, error: "eggs" };
  return Number.isFinite(n) && n > 0 && n <= MAX_FOOD_GRAMS ? { ok: true, value: n } : { ok: false, error: "grams" };
}

// Edible grams of an amount: grams as they are, eggs times the grams of one egg of that size
export const gramsOf = (amount, eggs = false, size = EGG_SIZE) => (eggs ? amount * (EGG_GRAMS[size] ?? EGG_GRAMS[EGG_SIZE]) : amount);

// Macros of a number of grams, unrounded, exactly as the engine scales them; fiber null stays null (no data)
export function macrosFor(p100, grams) {
  const factor = grams / 100;
  return Object.fromEntries(MACRO_FIELDS.map((k) => [k, p100[k] === null || p100[k] === undefined ? (k === "fiber_g" ? null : 0)
    : p100[k] * factor]));
}

// Vitamins and minerals of a number of grams, only the ones the food has, as smartbite_engine scale_micros
// (v * grams / 100, in that order, so the numbers are the engine's to the last digit)
export function microsFor(p100, grams) {
  return Object.fromEntries(MICRO_KEYS.filter((k) => Number.isFinite(p100[k])).map((k) => [k, (p100[k] * grams) / 100]));
}

// Rounded like My Day keeps an item (lib/day.js): kcal whole, grams to 0.1
const gramRound = (v) => Math.round(v * 10) / 10;
export const roundFood = (m) => ({ kcal: Math.round(m.kcal), protein_g: gramRound(m.protein_g), carbs_g: gramRound(m.carbs_g),
  fat_g: gramRound(m.fat_g), fiber_g: m.fiber_g === null ? null : gramRound(m.fiber_g) });

// "<name> (<amount>)" within My Day's 60 characters: the name is cut, never the amount
export function itemName(name, amountText) {
  const suffix = ` (${amountText})`;
  const room = Math.max(1, MAX_NAME - suffix.length);
  const base = String(name).trim();
  return (base.length > room ? base.slice(0, room).trimEnd() : base) + suffix;
}

// The My Day item for a picked food: { name, kcal, protein_g, carbs_g, fat_g, fiber_g?, source, micros? }
// (lib/day.js addExtra). source "food" for a table food, "label" for the user's product. Fiber left out when there is
// no data; micros: the amounts the food has, unrounded (lib/day.js microsToday turns them into % of the daily value).
export function foodItem(result, grams, amountText) {
  const m = roundFood(macrosFor(result.per100, grams));
  const { fiber_g: fiber, ...macros } = m;
  const micros = microsFor(result.per100, grams);
  return { name: itemName(result.name, amountText), ...macros, ...(fiber !== null && { fiber_g: fiber }),
    source: result.kind === "product" ? "label" : "food", ...(Object.keys(micros).length && { micros }) };
}

// An amount as components/DayFoods.jsx amountText writes it, in the page language: "2 eggs, size M" -> "2 huevos, tamaño M"
export function amountShown(text) {
  const m = String(text).match(/^(\d+) eggs?, size (\w+)$/);
  if (!m) return text;
  return Number(m[1]) === 1 ? t("{n} egg, size {size}", { n: m[1], size: m[2] }) : t("{n} eggs, size {size}", { n: m[1], size: m[2] });
}

// A My Day item's name in the page language: the food name shown in Spanish, the amount after it too
// ("Frozen peas (150 g)" -> "Guisantes congelados (150 g)"). The day keeps the English name, so a switch back works.
export function dayItemName(name) {
  const m = String(name).match(/^(.*) \(([^()]*)\)$/);
  return m ? `${foodName(m[1])} (${amountShown(m[2])})` : foodName(name);
}
