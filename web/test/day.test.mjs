// My Day (lib/day.js): items, servings, totals against the daily targets, what is left for one more meal, fiber and
// vitamins for the day, the picker order and the /demo sample day. Inline meals, plus the demo meals for sampleDay.
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// lib/*.js import each other without ".js" (Next.js resolves that); add it for node
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (specifier.startsWith(".") && !specifier.endsWith(".js")) return next(specifier + ".js", context);
    throw e;
  }
}`));

const day = await import("../lib/day.js");
const { toMeal } = await import("../lib/meal.js");
const { DEFAULT_PROFILE, setField } = await import("../lib/profile.js");
const { renderProfile } = await import("../lib/prompts.js");

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "meals");

const micro = (key, label, pct, partial = false) => ({ key, label, amount: "1 mg", pct, bar: Math.min(100, pct), partial });
// UI meals (toMeal shape), only the fields My Day reads
const OATS = { slug: "oats", name: "Berry oats", categories: ["Breakfast"], category: "Breakfast",
  perServing: { kcal: 401, protein_g: 30.25, carbs_g: 50, fat_g: 9.1 }, ingredients: [{ name: "rolled oats" }, { name: "skyr" }],
  fiberG: 8, micros: { rows: [micro("iron", "Iron", 20), micro("vitamin_c", "Vitamin C", 30, true)] } };
const BOWL = { slug: "bowl", name: "Chicken bowl", categories: ["Warm Meals", "Lunch", "Dinner"], category: "Warm Meals",
  perServing: { kcal: 500, protein_g: 45, carbs_g: 40, fat_g: 15 }, ingredients: [{ name: "chicken breast" }, { name: "rice" }],
  fiberG: 5, micros: { rows: [micro("iron", "Iron", 25), micro("calcium", "Calcium", 10)] } };
const OLD = { slug: "old-salad", name: "Tuna salad", categories: ["Salads", "Lunch", "Dinner"], category: "Salads",
  perServing: { kcal: 450, protein_g: 45, carbs_g: 30, fat_g: 12 }, ingredients: [{ name: "canned tuna" }],
  fiberG: null, micros: null };
const MEALS = [BOWL, OLD, OATS];
const BANANA = { name: "Banana", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 };

test("an empty day has the four slots, in order", () => {
  assert.deepEqual(day.SLOTS.map((s) => s.id), ["breakfast", "lunch", "snack", "dinner"]);
  assert.deepEqual(day.emptyDay(), { version: 1, next: 1, slots: { breakfast: [], lunch: [], snack: [], dinner: [] } });
  assert.deepEqual(day.normalizeDay(null), day.emptyDay());
  assert.deepEqual(day.normalizeDay("junk"), day.emptyDay());
});

test("items get ids i1, i2, ...; remove takes one out; a bad slot changes nothing", () => {
  let d = day.addRecipe(day.emptyDay(), "breakfast", "oats");
  d = day.addExtra(d, "snack", BANANA);
  assert.deepEqual(d.slots.breakfast, [{ id: "i1", kind: "recipe", slug: "oats", servings: 1 }]);
  assert.deepEqual(d.slots.snack, [{ id: "i2", kind: "extra", ...BANANA }]);
  assert.equal(d.next, 3);
  assert.equal(day.addRecipe(d, "brunch", "oats"), d);
  assert.equal(day.addRecipe(d, "lunch", "Not A Slug"), d);
  const out = day.removeItem(d, "snack", "i2");
  assert.deepEqual(out.slots.snack, []);
  assert.equal(day.addExtra(out, "snack", BANANA).slots.snack[0].id, "i3"); // ids are never reused
});

test("servings move in 0.5 steps, never under 0.5 or over 20", () => {
  let d = day.addRecipe(day.emptyDay(), "lunch", "bowl", 1);
  d = day.stepServings(d, "lunch", "i1", -0.5);
  assert.equal(d.slots.lunch[0].servings, 0.5);
  d = day.stepServings(d, "lunch", "i1", -0.5);
  assert.equal(d.slots.lunch[0].servings, 0.5);
  d = day.stepServings(day.addRecipe(day.emptyDay(), "lunch", "bowl", 19.5), "lunch", "i1", 0.5);
  assert.equal(d.slots.lunch[0].servings, 20);
  assert.equal(day.stepServings(d, "lunch", "i1", 0.5).slots.lunch[0].servings, 20);
  assert.equal(day.addRecipe(day.emptyDay(), "lunch", "bowl", 1.3).slots.lunch[0].servings, 1.5);
  assert.equal(day.snapServings("x"), 1);
});

test("scale: kcal whole, grams to 0.1, at 0.5 and 1.5 servings", () => {
  assert.deepEqual(day.scale(OATS.perServing, 0.5), { kcal: 201, protein_g: 15.1, carbs_g: 25, fat_g: 4.6 });
  assert.deepEqual(day.scale(OATS.perServing, 1.5), { kcal: 602, protein_g: 45.4, carbs_g: 75, fat_g: 13.7 });
  assert.deepEqual(day.scale({}, 2), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
});

test("normalizeDay drops bad items, snaps servings and keeps ids unique", () => {
  const d = day.normalizeDay({ version: 1, next: 2, slots: {
    breakfast: [{ id: "i5", kind: "recipe", slug: "oats", servings: 0.2 }, { id: "i5", kind: "recipe", slug: "bowl", servings: 99 }],
    lunch: [{ id: "i1", kind: "recipe", slug: "../x" }, { kind: "extra", name: "  Apple ", kcal: 80 }, { id: "i2", kind: "extra", name: "", kcal: 5 },
      { id: "i3", kind: "extra", name: "Nuts", kcal: -1 }, "junk", { id: "i4", kind: "pizza" }],
    brunch: [{ id: "i9", kind: "recipe", slug: "oats" }],
  } });
  assert.deepEqual(d.slots.breakfast, [{ id: "i5", kind: "recipe", slug: "oats", servings: 0.5 },
    { id: "i6", kind: "recipe", slug: "bowl", servings: 20 }]);
  assert.deepEqual(d.slots.lunch, [{ id: "i7", kind: "extra", name: "Apple", kcal: 80, protein_g: 0, carbs_g: 0, fat_g: 0 }]);
  assert.equal("brunch" in d.slots, false);
  assert.equal(d.next, 8);
  assert.deepEqual(day.normalizeDay(d), d); // stable
});

test("resolveDay: rows scaled by servings, subtotals and totals; a missing recipe is skipped", () => {
  let d = day.addRecipe(day.emptyDay(), "breakfast", "oats", 1.5);
  d = day.addExtra(d, "snack", BANANA);
  d = day.addRecipe(d, "dinner", "bowl", 0.5);
  d = day.addRecipe(d, "dinner", "deleted-meal", 1);
  const r = day.resolveDay(d, MEALS);
  assert.deepEqual(r.slots.map((s) => s.rows.length), [1, 0, 1, 1]);
  assert.deepEqual(r.slots[0].subtotal, { kcal: 602, protein_g: 45.4, carbs_g: 75, fat_g: 13.7 });
  assert.deepEqual(r.slots[1].subtotal, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  assert.deepEqual(r.slots[3].subtotal, { kcal: 250, protein_g: 22.5, carbs_g: 20, fat_g: 7.5 });
  assert.deepEqual(r.totals, { kcal: 957, protein_g: 69.2, carbs_g: 122, fat_g: 21.6 });
  const row = r.rows[0];
  assert.equal(row.name, "Berry oats");
  assert.equal(row.servings, 1.5);
  assert.equal(row.meal, OATS);
  assert.equal(r.rows.find((x) => x.kind === "extra").name, "Banana");
  assert.equal(d.slots.dinner.length, 2); // storage keeps the deleted recipe
  // the same meals as { slug: meal } give the same result
  assert.deepEqual(day.resolveDay(d, { oats: OATS, bowl: BOWL }).totals, r.totals);
});

test("readExtra: name and calories needed, empty grams are 0, a comma works", () => {
  assert.deepEqual(day.readExtra({ name: " Banana ", kcal: "105", protein: "1,3", carbs: "27", fat: "" }),
    { ok: true, extra: { name: "Banana", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0 } });
  assert.equal(day.readExtra({ name: "", kcal: "100" }).error, "Give the food a name.");
  assert.equal(day.readExtra({ name: "x".repeat(61), kcal: "100" }).error, "The name is too long (60 characters at most).");
  assert.equal(day.readExtra({ name: "Apple", kcal: "" }).error, "Type the calories.");
  assert.equal(day.readExtra({ name: "Apple", kcal: "lots" }).error, "Calories must be a number from 0 to 5000.");
  assert.equal(day.readExtra({ name: "Apple", kcal: "-5" }).error, "Calories must be a number from 0 to 5000.");
  assert.equal(day.readExtra({ name: "Apple", kcal: "80", protein: "a" }).error, "Protein must be a number of grams from 0 to 1000.");
  assert.equal(day.readExtra({ name: "Apple", kcal: "80", fat: "2000" }).error, "Fat must be a number of grams from 0 to 1000.");
  assert.equal(day.readExtra().ok, false);
});

test("daily targets come from the Profile, null when unset; they never reach the prompt", () => {
  assert.deepEqual(day.dailyTargets(DEFAULT_PROFILE), { kcal: null, protein_g: null, carbs_g: null, fat_g: null });
  assert.equal(day.hasTargets(day.dailyTargets(DEFAULT_PROFILE)), false);
  assert.deepEqual(day.dailyTargets(null), { kcal: null, protein_g: null, carbs_g: null, fat_g: null });
  let p = setField(DEFAULT_PROFILE, "daily_kcal_target", 1800);
  p = setField(p, "daily_fat_g_max", 0);
  assert.deepEqual(day.dailyTargets(p), { kcal: 1800, protein_g: null, carbs_g: null, fat_g: null });
  assert.equal(day.hasTargets(day.dailyTargets(p)), true);
  p = setField(setField(setField(p, "daily_protein_g_target", 140), "daily_carbs_g_max", 210), "daily_fat_g_max", 65);
  const text = renderProfile(p);
  assert.equal(text, renderProfile(DEFAULT_PROFILE));
  for (const v of ["1800", "140", "210", "65", "per day", "My Day"]) assert.ok(!text.includes(v), v);
});

test("targetStatus: goals say left or over, limits under or over; no target gives no text", () => {
  const totals = { kcal: 1558, protein_g: 152.4, carbs_g: 116.2, fat_g: 82 };
  const [kcal, protein, carbs, fat] = day.targetStatus(totals, { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 });
  assert.deepEqual(kcal, { key: "kcal", label: "Calories", kind: "goal", total: 1558, target: 2000, left: 442, over: false,
    text: "442 kcal left", bar: 78 });
  assert.deepEqual([protein.text, protein.over, protein.bar], ["2 g over", true, 100]);
  assert.deepEqual([carbs.kind, carbs.text, carbs.over, carbs.bar], ["limit", "84 g under", false, 58]);
  assert.deepEqual([fat.text, fat.over, fat.left], ["12 g over", true, -12]);
  const none = day.targetStatus(totals, { kcal: null, protein_g: null, carbs_g: null, fat_g: null });
  assert.deepEqual(none.map((s) => s.key), ["kcal", "protein_g", "carbs_g", "fat_g"]);
  assert.deepEqual(none[3], { key: "fat_g", label: "Fat", kind: "limit", total: 82, target: null, left: null, over: false,
    text: null, bar: null });
});

test("targetStatus: left and over come from the whole numbers the page shows", () => {
  // Fat 70.5 shows as 71 against 70: 1 g over and orange, not "0 g under"; protein 104.5 shows as 105: 45 g left
  const [, protein, , fat] = day.targetStatus({ kcal: 0, protein_g: 104.5, carbs_g: 0, fat_g: 70.5 },
    { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 });
  assert.deepEqual([fat.text, fat.over, fat.left], ["1 g over", true, -1]);
  assert.deepEqual([protein.text, protein.left], ["45 g left", 45]);
});

test("a meal for what is left: kcal to 10 within 200-1200, protein capped by the quiz's rules", () => {
  const targets = { kcal: 2000, protein_g: 150, carbs_g: null, fat_g: null };
  assert.deepEqual(day.mealForWhatsLeft({ kcal: 1558, protein_g: 104.6 }, targets),
    { kcal_target: 440, protein_g_target: 45, clamped: false });
  assert.deepEqual(day.mealForWhatsLeft({ kcal: 1950, protein_g: 70 }, targets),
    { kcal_target: 200, protein_g_target: 50, clamped: true }); // 50 kcal left; protein at most 200 / 4
  assert.deepEqual(day.mealForWhatsLeft({ kcal: 0, protein_g: 0 }, targets), { kcal_target: 1200, protein_g_target: 120, clamped: true });
  assert.deepEqual(day.mealForWhatsLeft({ kcal: 2500, protein_g: 160 }, targets), { kcal_target: 200, protein_g_target: 10, clamped: true });
  assert.equal(day.mealForWhatsLeft({ kcal: 0, protein_g: 0 }, { ...targets, protein_g: null }), null);
  assert.equal(day.mealForWhatsLeft({ kcal: 0, protein_g: 0 }, { ...targets, kcal: null }), null);
});

test("fiber and vitamins today: % times servings added up; extras and older recipes are not counted", () => {
  let d = day.addRecipe(day.emptyDay(), "breakfast", "oats", 1.5);
  d = day.addRecipe(d, "lunch", "old-salad");
  d = day.addExtra(d, "snack", BANANA);
  d = day.addExtra(d, "snack", BANANA);
  d = day.addRecipe(d, "dinner", "bowl", 0.5);
  const m = day.microsToday(day.resolveDay(d, MEALS).rows);
  assert.deepEqual(m.fiber, { grams: 15, pct: 58 }); // 8 x 1.5 + 5 x 0.5 = 14.5 g
  assert.deepEqual(m.nutrients, [
    { key: "iron", label: "Iron", pct: 43, bar: 43, partial: false }, // 20 x 1.5 + 25 x 0.5 = 42.5
    { key: "vitamin_c", label: "Vitamin C", pct: 45, bar: 45, partial: true },
    { key: "calcium", label: "Calcium", pct: 5, bar: 5, partial: false },
  ]);
  assert.deepEqual(m.notCounted, ["Tuna salad", "Banana"]);
  const big = day.microsToday(day.resolveDay(day.addRecipe(day.emptyDay(), "lunch", "oats", 5), MEALS).rows);
  assert.deepEqual(big.nutrients[1], { key: "vitamin_c", label: "Vitamin C", pct: 150, bar: 100, partial: true });
  assert.deepEqual(day.microsToday([]), { fiber: null, nutrients: [], notCounted: [] });
});

test("picker: recipes that fit the slot first, order kept; Snack keeps the order; search name and foods", () => {
  const slugs = (list) => list.map((x) => x.meal.slug);
  assert.deepEqual(slugs(day.pickerList(MEALS, "breakfast")), ["oats", "bowl", "old-salad"]);
  assert.deepEqual(day.pickerList(MEALS, "breakfast").map((x) => x.match), [true, false, false]);
  assert.deepEqual(slugs(day.pickerList(MEALS, "lunch")), ["bowl", "old-salad", "oats"]);
  assert.deepEqual(slugs(day.pickerList(MEALS, "snack")), ["bowl", "old-salad", "oats"]);
  assert.deepEqual(day.pickerList(MEALS, "snack").map((x) => x.match), [false, false, false]);
  assert.deepEqual(slugs(day.pickerList(MEALS, "dinner", "  TUNA ")), ["old-salad"]);
  assert.deepEqual(slugs(day.pickerList(MEALS, "dinner", "rice chicken")), ["bowl"]);
  assert.deepEqual(slugs(day.pickerList(MEALS, "dinner", "skyr")), ["oats"]);
  assert.deepEqual(day.pickerList(MEALS, "dinner", "pizza"), []);
});

test("the demo sample day: three demo meals and a banana, 1558 kcal against SAMPLE_TARGETS", () => {
  const slugs = ["carrot-cake-overnight-oats-with-berries", "classic-lentil-stew-with-chickpeas-and-chicken",
    "tuna-frittata-with-vegetables"];
  const demo = slugs.map((s) => toMeal(s, JSON.parse(fs.readFileSync(path.join(DEMO, `${s}.json`), "utf8")), { kind: "demo" }));
  const d = day.sampleDay(demo);
  assert.deepEqual(day.SAMPLE_TARGETS, { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 });
  assert.deepEqual(Object.values(d.slots).map((items) => items.length), [1, 1, 1, 1]);
  assert.deepEqual(d.slots.snack[0], { id: "i3", kind: "extra", ...BANANA });
  const r = day.resolveDay(d, demo);
  assert.equal(r.totals.kcal, 1558);
  assert.equal(day.targetStatus(r.totals, day.SAMPLE_TARGETS)[0].text, "442 kcal left");
  assert.equal(day.microsToday(r.rows).notCounted.join(), "Banana");
  // A demo meal that is not there is skipped
  const short = day.sampleDay(demo.slice(1));
  assert.deepEqual(short.slots.breakfast, []);
  assert.equal(day.resolveDay(short, demo).rows.length, 3);
});
