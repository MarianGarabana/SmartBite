// "Fit to packs" (decided 2026-11-20): the Cart's Adjust leftovers on one meal; Apply changes the saved meal and Undo
// brings back the meal from before the first fit. Demo meals as fixtures; no engine call (the engine reply is faked).
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

const { toMeal } = await import("../lib/meal.js");
const { fitInfo, fitPreview, fittedRecipe, undoFit, withFit } = await import("../lib/fitpacks.js");

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "meals");
const load = (slug) => JSON.parse(fs.readFileSync(path.join(DEMO, `${slug}.json`), "utf8"));
const SALAD = "tuna-and-chickpea-salad-with-skyr-dressing";
const FRITTATA = "tuna-frittata-with-vegetables";

test("a meal with leftovers gets suggestions, and they cut the leftovers", () => {
  const meal = toMeal(SALAD, load(SALAD), { kind: "local" });
  const info = fitInfo(meal);
  assert.ok(info.suggestions.length >= 1);
  assert.ok(info.suggestions.some((s) => s.kind === "fit")); // whole cans of tuna first
  assert.ok(info.after.wasteGrams < info.before.wasteGrams);
  // the preview with nothing ticked is the meal as it is
  assert.equal(fitPreview(meal, []).wasteGrams, info.before.wasteGrams);
});

test("a meal whose packs already fit gets no suggestion", () => {
  assert.deepEqual(fitInfo(toMeal(FRITTATA, load(FRITTATA), { kind: "local" })).suggestions, []);
});

test("the fitted recipe takes the new servings and grams, scales the budget, and leaves the rest", () => {
  const doc = load(SALAD);
  const meal = toMeal(SALAD, doc, { kind: "local" });
  const fit = fitInfo(meal).suggestions.find((s) => s.kind === "fit");
  const { form, recipe } = fittedRecipe(doc, meal, [fit.id]);
  assert.equal(form.servings, fit.to);
  assert.equal(recipe.servings, fit.to);
  const changed = recipe.ingredients.find((i) => i.name === fit.ingredient || i.name.toLowerCase() === fit.food);
  assert.equal(changed.grams_per_serving, fit.gramsTo);
  assert.ok(Math.abs(form.budget_total_eur - (doc.form.budget_total_eur * fit.to) / doc.form.servings) < 0.01);
  const others = recipe.ingredients.filter((i) => i !== changed);
  for (const i of others) assert.deepEqual(i, doc.recipe.ingredients.find((o) => o.name === i.name));
  assert.deepEqual(recipe.steps, doc.recipe.steps);
});

test("nothing ticked changes nothing", () => {
  const doc = load(SALAD);
  const { form, recipe } = fittedRecipe(doc, toMeal(SALAD, doc, { kind: "local" }), []);
  assert.deepEqual(recipe, doc.recipe);
  assert.equal(form.servings, doc.form.servings);
});

test("Undo brings back the meal from before the first fit, exactly", () => {
  const doc = { ...load(SALAD), date: "2026-11-20", shared: true };
  const meal = toMeal(SALAD, doc, { kind: "local" });
  const ids = fitInfo(meal).suggestions.map((s) => s.id);
  const { form, recipe } = fittedRecipe(doc, meal, ids);
  const engine = (f, r) => ({ form: f, picked_idea: doc.picked_idea, recipe: r, evaluation: { ...doc.evaluation, faked: true } });
  const once = withFit(doc, engine(form, recipe));
  assert.equal(once.date, "2026-11-20"); // the meal's own fields stay
  assert.equal(once.shared, true);
  assert.deepEqual(once.recipe, recipe);
  assert.deepEqual(once.before_fit.recipe, doc.recipe);
  // a second fit keeps the first copy
  const twice = withFit(once, engine({ ...form, servings: 2 }, recipe));
  assert.deepEqual(twice.before_fit, once.before_fit);
  assert.deepEqual(undoFit(twice), doc);
  assert.deepEqual(undoFit(doc), doc); // nothing to undo
});
