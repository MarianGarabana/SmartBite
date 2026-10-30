// Fiber and vitamins and minerals on the recipe page (lib/meal.js): amounts, % of the daily value, coverage, and
// meals saved before they were counted (no fields: hidden, no NaN). Inline fixtures, no demo data.
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

// lib/*.js import each other without ".js" (Next.js resolves that); add it for node
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (specifier.startsWith(".") && !specifier.endsWith(".js")) return next(specifier + ".js", context);
    throw e;
  }
}`));

const { amountText, fiberOf, microsOf, toMeal, unitText } = await import("../lib/meal.js");

const nutrient = (key, label, unit, per_serving, pct, withData = 3, total = 3) =>
  ({ key, label, unit, per_serving, nrv: 1, pct, ingredients_with_data: withData, ingredients_total: total });
const MICROS = {
  nutrients: [
    nutrient("iron", "Iron", "mg", 2.14, 15),
    nutrient("vitamin_c", "Vitamin C", "mg", 96.4, 120),
    nutrient("vitamin_d", "Vitamin D", "ug", 0.02, 0, 2, 3),
    nutrient("folate", "Folate", "ug", 85.3, 43),
  ],
  summary: { at_least_15pct: 3, count: 4 },
  coverage: { with_data: 2, total: 3, missing: ["skyr"] },
  reference: "EU reference intakes (Regulation (EU) 1169/2011, Annex XIII)",
};

test("amounts: whole numbers from 10 up, one decimal below, a trace is <0.1, ug shows as µg", () => {
  assert.equal(amountText(812.4, "mg"), "812 mg");
  assert.equal(amountText(2.14, "mg"), "2.1 mg");
  assert.equal(amountText(0.4, "ug"), "0.4 µg");
  assert.equal(amountText(0.02, "ug"), "<0.1 µg");
  assert.equal(amountText(0, "mg"), "0 mg");
  assert.equal(unitText("ug"), "µg");
  assert.equal(unitText("mg"), "mg");
});

test("fiber: whole grams and % of 25 g; computed when the % is missing; null without fiber", () => {
  assert.deepEqual(fiberOf({ per_serving: { fiber_g: 8.6 }, fiber_pct: 34 }), { grams: "9g", pct: 34 });
  assert.deepEqual(fiberOf({ per_serving: { fiber_g: 5 } }), { grams: "5g", pct: 20 });
  assert.equal(fiberOf({ per_serving: { kcal: 450 } }), null);
  assert.equal(fiberOf(undefined), null);
});

test("micros: rows, bar capped at 100, partial rows, summary, coverage and source", () => {
  const m = microsOf({ micros: MICROS });
  assert.deepEqual(m.rows.map((r) => [r.label, r.amount, r.pct, r.bar, r.partial]), [
    ["Iron", "2.1 mg", 15, 15, false],
    ["Vitamin C", "96 mg", 120, 100, false],
    ["Vitamin D", "<0.1 µg", 0, 0, true],
    ["Folate", "85 µg", 43, 43, false],
  ]);
  assert.equal(m.summary, "At least 15% of the daily value for 3 of 4 nutrients.");
  assert.equal(m.coverage, "Based on 2 of 3 ingredients.");
  assert.equal(m.missing, "No data for skyr.");
  assert.equal(m.partial, true);
  assert.equal(m.reference, MICROS.reference);
});

test("micros: full coverage has no coverage line and no partial note", () => {
  const nutrients = MICROS.nutrients.map((n) => ({ ...n, ingredients_with_data: 3 }));
  const m = microsOf({ micros: { ...MICROS, nutrients, coverage: { with_data: 3, total: 3, missing: [] } } });
  assert.equal(m.coverage, null);
  assert.equal(m.missing, null);
  assert.equal(m.partial, false);
});

test("micros: a row without numbers is left out and the summary is counted again", () => {
  const nutrients = [...MICROS.nutrients, nutrient("zinc", "Zinc", "mg", null, NaN)];
  const m = microsOf({ micros: { ...MICROS, nutrients, summary: { at_least_15pct: 3, count: 5 } } });
  assert.equal(m.rows.length, 4);
  assert.equal(m.summary, "At least 15% of the daily value for 3 of 4 nutrients.");
});

test("micros: missing or empty is null (the page hides the panel)", () => {
  assert.equal(microsOf({}), null);
  assert.equal(microsOf(undefined), null);
  assert.equal(microsOf({ micros: { nutrients: [] } }), null);
});

// A meal saved before fiber and micros were counted: the same shape as the demo meals had before
const OLD = {
  form: { servings: 2, kcal_target: 450, protein_g_target: 45 },
  recipe: { title: "Tuna salad", prep_time_min: 10, ingredients: [{ name: "canned tuna", grams_per_serving: 100 }] },
  evaluation: {
    pack: { lines: [] },
    macros: { per_serving: { kcal: 450, protein_g: 45, carbs_g: 30, fat_g: 12 }, lines: [] },
  },
};

test("a meal saved before fiber and micros has neither; one with them gets both", () => {
  const old = toMeal("tuna-salad", OLD);
  assert.equal(old.fiber, null);
  assert.equal(old.micros, null);
  const macros = { ...OLD.evaluation.macros, per_serving: { ...OLD.evaluation.macros.per_serving, fiber_g: 6.2 },
    fiber_pct: 25, micros: MICROS };
  const meal = toMeal("tuna-salad", { ...OLD, evaluation: { ...OLD.evaluation, macros } });
  assert.deepEqual(meal.fiber, { grams: "6g", pct: 25 });
  assert.equal(meal.micros.rows.length, 4);
});
