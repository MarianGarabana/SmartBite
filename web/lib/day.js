// My Day (decided 2026-11-14): one day of meals, Breakfast, Lunch, Snack and Dinner, added up against the daily
// targets in the Profile. Pure: the page keeps the day (lib/store.js readDay/writeDay; the demo in React state only).
// Recipes are kept by slug, so edits to a recipe flow through and a deleted recipe drops out of the totals; storage
// is never pruned (the meals may not be read yet). All math here, rounded like the recipe page: kcal whole, grams to 0.1.
import { fieldValue } from "./profile";

export const SLOTS = [
  { id: "breakfast", label: "Breakfast", category: "Breakfast" },
  { id: "lunch", label: "Lunch", category: "Lunch" },
  { id: "snack", label: "Snack", category: "Snacks" }, // Snacks first (meal.js categoriesOf, decided 2026-11-14)
  { id: "dinner", label: "Dinner", category: "Dinner" },
];
export const STEP = 0.5;
export const MIN_SERVINGS = 0.5;
export const MAX_SERVINGS = 20;
const MAX_ITEMS = 50; // per slot: a damaged or hand-edited day cannot grow without end
const MAX_NAME = 60;
const SLUG = /^[a-z0-9-]+$/; // same as meal.js SLUG (day.js imports only lib/profile)
const ITEM_ID = /^i(\d+)$/;
const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"];

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const kcalRound = (v) => Math.round(v);
const gramRound = (v) => Math.round(v * 10) / 10;
const roundMacros = (m) => ({ kcal: kcalRound(m.kcal), protein_g: gramRound(m.protein_g), carbs_g: gramRound(m.carbs_g),
  fat_g: gramRound(m.fat_g) });
const zero = () => ({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
const add = (a, b) => roundMacros(Object.fromEntries(MACROS.map((k) => [k, a[k] + b[k]])));

// Servings on the 0.5 grid, from 0.5 to 20; anything not a number is 1
export function snapServings(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n / STEP) * STEP));
}

export const emptyDay = () => ({ version: 1, next: 1, slots: Object.fromEntries(SLOTS.map((s) => [s.id, []])) });

const okNumber = (v, max) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const MAX_KCAL = 5000;
const MAX_GRAMS = 1000;

// One stored item as kept, or null when it cannot be read
function okItem(raw) {
  if (!isObject(raw)) return null;
  if (raw.kind === "recipe") {
    if (typeof raw.slug !== "string" || !SLUG.test(raw.slug)) return null;
    return { kind: "recipe", slug: raw.slug, servings: snapServings(raw.servings) };
  }
  if (raw.kind === "extra") {
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME) : "";
    if (!name || !okNumber(raw.kcal, MAX_KCAL)) return null;
    const grams = (v) => (okNumber(v, MAX_GRAMS) ? gramRound(v) : 0);
    return { kind: "extra", name, kcal: kcalRound(raw.kcal), protein_g: grams(raw.protein_g), carbs_g: grams(raw.carbs_g),
      fat_g: grams(raw.fat_g) };
  }
  return null;
}

// Any stored value as a day: unknown slots and bad items dropped, servings snapped, ids unique ("i<n>"), next past them
export function normalizeDay(raw) {
  const day = emptyDay();
  if (!isObject(raw)) return day;
  const slots = isObject(raw.slots) ? raw.slots : {};
  const seen = new Set();
  let top = 0;
  const later = []; // items whose id is missing or taken get a new one after the rest
  for (const s of SLOTS) {
    for (const value of Array.isArray(slots[s.id]) ? slots[s.id] : []) {
      if (day.slots[s.id].length >= MAX_ITEMS) break;
      const item = okItem(value);
      if (!item) continue;
      const m = typeof value.id === "string" ? ITEM_ID.exec(value.id) : null;
      if (m && !seen.has(value.id)) {
        seen.add(value.id);
        top = Math.max(top, Number(m[1]));
        day.slots[s.id].push({ id: value.id, ...item });
      } else {
        const entry = { ...item };
        later.push(entry);
        day.slots[s.id].push(entry);
      }
    }
  }
  let next = Math.max(Number.isInteger(raw.next) && raw.next > 0 ? raw.next : 1, top + 1);
  for (const entry of later) {
    while (seen.has(`i${next}`)) next += 1;
    entry.id = `i${next}`;
    seen.add(entry.id);
    next += 1;
  }
  // id first, like the items added below
  for (const s of SLOTS) day.slots[s.id] = day.slots[s.id].map(({ id, ...rest }) => ({ id, ...rest }));
  day.next = next;
  return day;
}

const hasSlot = (slotId) => SLOTS.some((s) => s.id === slotId);

function addItem(day, slotId, item) {
  if (!hasSlot(slotId) || day.slots[slotId].length >= MAX_ITEMS) return day;
  const id = `i${day.next}`;
  return { ...day, next: day.next + 1, slots: { ...day.slots, [slotId]: [...day.slots[slotId], { id, ...item }] } };
}

export function addRecipe(day, slotId, slug, servings = 1) {
  if (typeof slug !== "string" || !SLUG.test(slug)) return day;
  return addItem(day, slotId, { kind: "recipe", slug, servings: snapServings(servings) });
}

// The "Add your own" form: strings as typed (a comma works as the decimal point). Name and calories are needed;
// empty protein, carbs or fat count as 0.
export function readExtra({ name, kcal, protein, carbs, fat } = {}) {
  const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const label = text(name);
  if (!label) return { ok: false, error: "Give the food a name." };
  if (label.length > MAX_NAME) return { ok: false, error: `The name is too long (${MAX_NAME} characters at most).` };
  const num = (v) => Number(text(v).replace(",", "."));
  if (!text(kcal)) return { ok: false, error: "Type the calories." };
  const k = num(kcal);
  if (!okNumber(k, MAX_KCAL)) return { ok: false, error: `Calories must be a number from 0 to ${MAX_KCAL}.` };
  const grams = {};
  for (const [key, value, word] of [["protein_g", protein, "Protein"], ["carbs_g", carbs, "Carbs"], ["fat_g", fat, "Fat"]]) {
    if (!text(value)) { grams[key] = 0; continue; }
    const g = num(value);
    if (!okNumber(g, MAX_GRAMS)) return { ok: false, error: `${word} must be a number of grams from 0 to ${MAX_GRAMS}.` };
    grams[key] = gramRound(g);
  }
  return { ok: true, extra: { name: label, kcal: kcalRound(k), ...grams } };
}

export function addExtra(day, slotId, extra) {
  const item = okItem({ ...extra, kind: "extra" });
  return item ? addItem(day, slotId, item) : day;
}

export function removeItem(day, slotId, id) {
  if (!hasSlot(slotId)) return day;
  return { ...day, slots: { ...day.slots, [slotId]: day.slots[slotId].filter((it) => it.id !== id) } };
}

// + or - one step; stays within 0.5 and 20 servings
export function stepServings(day, slotId, id, delta) {
  if (!hasSlot(slotId)) return day;
  return { ...day, slots: { ...day.slots, [slotId]: day.slots[slotId].map((it) => (it.id === id && it.kind === "recipe"
    ? { ...it, servings: snapServings(it.servings + Number(delta || 0)) } : it)) } };
}

// Per-serving macros (meal.perServing) times the servings
export function scale(perServing, servings) {
  const v = (k) => (Number.isFinite(perServing?.[k]) ? perServing[k] : 0) * servings;
  return roundMacros({ kcal: v("kcal"), protein_g: v("protein_g"), carbs_g: v("carbs_g"), fat_g: v("fat_g") });
}

const bySlug = (meals) => (Array.isArray(meals) ? Object.fromEntries(meals.filter(Boolean).map((m) => [m.slug, m]))
  : isObject(meals) ? meals : {});

// The day with its meals: rows per slot, slot subtotals and day totals. meals: the UI meals (toMeal), as a list or
// { slug: meal }. Pass the recipes the user can see (meal.js recipeMeals), so a deleted recipe is skipped.
export function resolveDay(day, meals) {
  const known = bySlug(meals);
  const rows = [];
  const slots = SLOTS.map((s) => {
    const slotRows = [];
    for (const it of day?.slots?.[s.id] || []) {
      if (it.kind === "recipe") {
        const meal = known[it.slug];
        if (!meal) continue;
        slotRows.push({ id: it.id, slotId: s.id, kind: "recipe", slug: it.slug, name: meal.name, servings: it.servings,
          ...scale(meal.perServing, it.servings), meal });
      } else if (it.kind === "extra") {
        slotRows.push({ id: it.id, slotId: s.id, kind: "extra", name: it.name, kcal: it.kcal, protein_g: it.protein_g,
          carbs_g: it.carbs_g, fat_g: it.fat_g });
      }
    }
    rows.push(...slotRows);
    return { id: s.id, label: s.label, rows: slotRows, subtotal: slotRows.reduce(add, zero()) };
  });
  return { slots, totals: slots.reduce((t, s) => add(t, s.subtotal), zero()), rows };
}

// Daily targets from the Profile (prompt: false, never sent to the AI); null when unset or not above 0. No defaults.
export function dailyTargets(profile) {
  const get = (id) => {
    const n = Number(fieldValue(profile, id));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return { kcal: get("daily_kcal_target"), protein_g: get("daily_protein_g_target"), carbs_g: get("daily_carbs_g_max"),
    fat_g: get("daily_fat_g_max") };
}

export const hasTargets = (t) => MACROS.some((k) => t?.[k] != null);

const STATUS = [
  { key: "kcal", label: "Calories", kind: "goal", unit: "kcal" },
  { key: "protein_g", label: "Protein", kind: "goal", unit: "g" },
  { key: "carbs_g", label: "Carbs", kind: "limit", unit: "g" },
  { key: "fat_g", label: "Fat", kind: "limit", unit: "g" },
];

// One line per macro, always all four in this order. Goals (kcal, protein): "X left", or "X over" past the target.
// Limits (carbs, fat): "X g under" or "X g over" (only an over limit is shown in orange; the page picks the color
// from kind and over). With no target: target, left, text and bar are null and over is false.
export function targetStatus(totals, targets) {
  return STATUS.map(({ key, label, kind, unit }) => {
    const total = Number.isFinite(totals?.[key]) ? totals[key] : 0;
    const target = Number.isFinite(targets?.[key]) && targets[key] > 0 ? targets[key] : null;
    const shownTotal = key === "kcal" ? kcalRound(total) : gramRound(total);
    if (target === null) return { key, label, kind, total: shownTotal, target: null, left: null, over: false, text: null, bar: null };
    // From the whole number the page shows (fat 70.5 shows as 71, so 70 - 71 = 1 g over, not "0 g under")
    const diff = Math.round(target) - Math.round(total);
    const over = diff < 0;
    const amount = `${Math.abs(diff)} ${unit}`;
    const text = kind === "goal" ? `${amount} ${over ? "over" : "left"}` : `${amount} ${over ? "over" : "under"}`;
    return { key, label, kind, total: shownTotal, target, left: diff, over, text,
      bar: Math.max(0, Math.min(100, Math.round((total / target) * 100))) };
  });
}

// Make Your Meal's starting targets from what is left of the day, inside the quiz's dials: kcal in steps of 10 from
// 200 to 1200, protein whole grams from 10 to 120 and never above kcal / 4 (the quiz's own check). null unless both
// the calories and the protein target are set. clamped: a value had to move to fit the dials.
export function mealForWhatsLeft(totals, targets) {
  if (!(targets?.kcal > 0) || !(targets?.protein_g > 0)) return null;
  const kcalLeft = Math.round((targets.kcal - (totals?.kcal || 0)) / 10) * 10;
  const kcal = Math.min(1200, Math.max(200, kcalLeft));
  const proteinLeft = Math.round(targets.protein_g - (totals?.protein_g || 0));
  const protein = Math.min(Math.floor(kcal / 4), Math.min(120, Math.max(10, proteinLeft)));
  return { kcal_target: kcal, protein_g_target: protein, clamped: kcal !== kcalLeft || protein !== proteinLeft };
}

// Fiber and vitamins and minerals for the day: % of the daily value per serving times the servings, added up over the
// recipes. Extras and recipes made before micros were counted are listed in notCounted (once each, in day order).
// fiber: whole grams and % of 25 g, or null when no recipe has fiber. bar: the % capped at 100.
export function microsToday(rows) {
  const nutrients = new Map();
  const notCounted = [];
  let fiber = null;
  for (const r of rows || []) {
    const micros = r.kind === "recipe" ? r.meal?.micros : null;
    if (r.kind === "recipe" && Number.isFinite(r.meal?.fiberG)) fiber = (fiber || 0) + r.meal.fiberG * r.servings;
    if (!micros) {
      if (!notCounted.includes(r.name)) notCounted.push(r.name);
      continue;
    }
    for (const row of micros.rows || []) {
      const had = nutrients.get(row.key) || { key: row.key, label: row.label, pct: 0, partial: false };
      nutrients.set(row.key, { ...had, pct: had.pct + row.pct * r.servings, partial: had.partial || !!row.partial });
    }
  }
  return {
    fiber: fiber === null ? null : { grams: Math.round(fiber), pct: Math.round((fiber / 25) * 100) },
    nutrients: [...nutrients.values()].map((n) => {
      const pct = Math.round(n.pct);
      return { key: n.key, label: n.label, pct, bar: Math.max(0, Math.min(100, pct)), partial: n.partial };
    }),
    notCounted,
  };
}

// The "+ Add" picker: recipes that fit the slot first (Breakfast, Lunch, Snacks, Dinner), then the rest, each in the
// order given. A search keeps recipes with every word in the name or a food.
// match: the recipe fits this slot.
export function pickerList(meals, slotId, query = "") {
  const category = SLOTS.find((s) => s.id === slotId)?.category || null;
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const found = (meals || []).filter((m) => {
    if (!words.length) return true;
    const text = [m.name, ...(m.ingredients || []).map((it) => it.name)].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  }).map((meal) => ({ meal, match: !!category && (meal.categories || []).includes(category) }));
  return [...found.filter((x) => x.match), ...found.filter((x) => !x.match)];
}

// The /demo day (never stored): three demo meals and a banana, against SAMPLE_TARGETS
export const SAMPLE_TARGETS = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };
const SAMPLE = [
  ["breakfast", "carrot-cake-overnight-oats-with-berries"],
  ["lunch", "classic-lentil-stew-with-chickpeas-and-chicken"],
  ["snack", { name: "Banana", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 }],
  ["dinner", "tuna-frittata-with-vegetables"],
];

export function sampleDay(demoMeals) {
  const known = bySlug(demoMeals);
  return SAMPLE.reduce((day, [slotId, item]) => (typeof item === "string"
    ? (known[item] ? addRecipe(day, slotId, item, 1) : day)
    : addExtra(day, slotId, item)), emptyDay());
}
