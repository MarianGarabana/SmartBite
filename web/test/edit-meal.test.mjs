// Editing a meal by hand (decided 2026-11-09): the recipe rebuilt from the edit form, defaults for an added food, and
// the checks before saving. Pure functions from lib/meal.js; no server, no model.
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

const { editProblem, editedRecipe, newIngredient } = await import("../lib/meal.js");

const RECIPE = { idea_id: "2", title: "Chicken rice bowl", servings: 2, prep_time_min: 30, steps: ["Cook."],
  ingredients: [
    { name: "chicken breast", grams_per_serving: 170, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
    { name: "eggs", grams_per_serving: 102, units_per_serving: 2, storage: "fresh", pantry: false, dry: false },
    { name: "olive oil", grams_per_serving: 5, units_per_serving: 0, storage: "keeps", pantry: true, dry: false, note: "for the pan" },
  ] };
const rowsOf = (recipe) => recipe.ingredients.map((it, i) => ({ key: i, base: it, name: it.name,
  units_per_serving: it.units_per_serving, amount: String(it.units_per_serving || it.grams_per_serving) }));

test("an unchanged form gives back the same recipe", () => {
  const out = editedRecipe(RECIPE, { title: RECIPE.title, stepsText: "Cook.", rows: rowsOf(RECIPE) });
  assert.deepEqual(out, RECIPE);
});

test("name, steps (one per line), grams and eggs in units; other fields of a food are kept", () => {
  const rows = rowsOf(RECIPE);
  rows[0].amount = "150";
  rows[1].amount = "3";
  const out = editedRecipe(RECIPE, { title: "  Chicken and egg bowl ", stepsText: "Cook the rice.\n\n  Grill the chicken. \n", rows });
  assert.equal(out.title, "Chicken and egg bowl");
  assert.deepEqual(out.steps, ["Cook the rice.", "Grill the chicken."]);
  assert.equal(out.ingredients[0].grams_per_serving, 150);
  assert.deepEqual([out.ingredients[1].units_per_serving, out.ingredients[1].grams_per_serving], [3, 153]);
  assert.deepEqual(out.ingredients[2], RECIPE.ingredients[2]); // pantry flag and note stay
  assert.equal(out.idea_id, "2");
});

test("a removed food is gone; an added food gets storage and dry weight from its name", () => {
  const rows = rowsOf(RECIPE).slice(1);
  rows.push({ key: 9, isNew: true, name: " brown rice ", units_per_serving: 0, amount: "80" });
  const out = editedRecipe(RECIPE, { title: "x", stepsText: "a", rows });
  assert.deepEqual(out.ingredients.map((i) => i.name), ["eggs", "olive oil", "brown rice"]);
  assert.deepEqual(out.ingredients[2], { name: "brown rice", grams_per_serving: 80, units_per_serving: 0, storage: "keeps",
    pantry: false, dry: true });
  assert.equal(newIngredient("frozen peas", 100).storage, "frozen");
  assert.equal(newIngredient("spinach", 60).storage, "fresh");
  assert.equal(newIngredient("canned chickpeas", 100).storage, "keeps");
  assert.deepEqual([newIngredient("eggs", 120).units_per_serving, newIngredient("eggs", 120).grams_per_serving], [2, 102]);
  assert.equal(newIngredient("egg whites", 100).units_per_serving, 0);
});

test("checks before saving: name, steps, at least one food, names and amounts above 0", () => {
  const ok = { title: "Bowl", stepsText: "Cook.", rows: rowsOf(RECIPE) };
  assert.equal(editProblem(ok), "");
  assert.match(editProblem({ ...ok, title: " " }), /name/);
  assert.match(editProblem({ ...ok, title: "x".repeat(101) }), /too long/);
  assert.match(editProblem({ ...ok, stepsText: "\n" }), /step/);
  assert.match(editProblem({ ...ok, rows: [] }), /at least one food/);
  assert.match(editProblem({ ...ok, rows: [{ ...ok.rows[0], amount: "0" }] }), /above 0/);
  assert.match(editProblem({ ...ok, rows: [{ ...ok.rows[0], name: "" }] }), /needs a name/);
});
