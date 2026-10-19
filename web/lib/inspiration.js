// Real dishes for the Idea agent: 12 per request, craving matches first, the rest in a seeded random order, none
// with an excluded food. JS port of smartbite_engine/inspiration.py: same seed, same 12 dishes (test/inspiration.test.mjs
// runs both). Dish foods are English keys (data/open/aliases.json); Spanish cravings and exclusions match through the
// aliases (lib/names.js). Pure: no browser or Node APIs beyond TextEncoder.
import { DISHES } from "../generated/index.js";
import { aliasesOf, canonical, stems } from "./names.js";

export const COUNT = 12;
export const FIELDS = ["name", "cuisine", "style", "core", "method"];

// 32-bit FNV-1a hash of String(seed) in UTF-8
export function seedNumber(seed) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(seed))) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h;
}

// Endless 32-bit numbers from the seed (mulberry32), the same as numbers() in smartbite_engine/inspiration.py
export function* numbers(seed) {
  let a = seedNumber(seed);
  for (;;) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1) >>> 0;
    t = (((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0) ^ t) >>> 0;
    yield (t ^ (t >>> 14)) >>> 0;
  }
}

// New array in a seeded order (Fisher-Yates, index = number mod (i + 1))
export function shuffled(items, seed) {
  const out = [...items];
  const draw = numbers(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = draw.next().value % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const subset = (small, big) => [...small].every((w) => big.has(w));

// Each main food of a dish as a list of its names: the English key first, then its aliases
export function foods(dish) {
  return dish.core.map((name) => {
    const key = canonical(name) || name;
    return [key, ...aliasesOf(key), ...(name !== key ? [name] : [])];
  });
}

// True when one excluded food matches a main food: every word of the excluded item is in one name of that food
// (English key or an alias). "pollo" matches "chicken thigh" (alias "contramuslo de pollo").
export function hasFood(dish, exclude) {
  const banned = (exclude || []).map(stems).filter((s) => s.size);
  if (!banned.length) return false;
  const names = foods(dish).flat().map(stems);
  return banned.some((b) => names.some((n) => subset(b, n)));
}

const about = (dish) => stems([dish.name, dish.cuisine, dish.style, ...foods(dish).flat()].join(" "));

export function pickDishes(craving, exclude = [], { seed, dishes = DISHES, count = COUNT } = {}) {
  if (seed === undefined || seed === null) throw new Error("pickDishes needs a seed");
  const wanted = stems(craving);
  const allowed = shuffled(dishes.filter((d) => !hasFood(d, exclude)), seed);
  const score = new Map(allowed.map((d) => [d, [...about(d)].filter((w) => wanted.has(w)).length]));
  allowed.sort((a, b) => score.get(b) - score.get(a)); // stable sort: ties keep the shuffled order
  return allowed.slice(0, count).map((d) => Object.fromEntries(FIELDS.map((k) => [k, d[k]])));
}
