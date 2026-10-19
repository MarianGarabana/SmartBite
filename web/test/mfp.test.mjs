// MyFitnessPal block on the recipe page: grams for the servings shown, never a "0 g" line for a pinch of spice.
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

const { mfpBlock } = await import("../lib/mfp.js");
const { toMeal } = await import("../lib/meal.js");

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "meals");
const KOREAN = "korean-beef-bowl-with-peas-and-brown-rice-lentil-mix";

// Same items as components/RecipePage.jsx sends for the servings shown
const block = (meal, servings) => mfpBlock(meal.name, servings,
  [...meal.ingredients, ...meal.mfpExtra].map((i) => ({ ...i, grams: i.grams * servings })));

test("spices under 1 g show their real grams, not 0 g", () => {
  const meal = toMeal(KOREAN, JSON.parse(fs.readFileSync(path.join(DEMO, `${KOREAN}.json`), "utf8")));
  const lines = block(meal, 1).split("\n");
  assert.equal(lines.filter((l) => / 0 g/.test(l)).length, 0, lines.join("\n"));
  assert.ok(lines.includes("chili flakes, 0.3 g"), lines.join("\n"));
  assert.ok(lines.includes("black pepper, 0.3 g (raw)"), lines.join("\n"));
  assert.ok(lines.includes("ground ginger, 0.5 g"), lines.join("\n"));
  // 1 g and up stay whole grams, as before
  assert.ok(lines.includes("ground beef, 100 g (raw)"));
  assert.ok(block(meal, 8).split("\n").includes("chili flakes, 2 g"));
});

test("an amount that rounds to 0.0 g is left out", () => {
  const out = mfpBlock("T", 1, [{ name: "salt", grams: 0.02, food: "salt" }, { name: "rice", grams: 60, food: "rice", dry: true }]);
  assert.deepEqual(out.split("\n"), ["SmartBite: T", "Servings: 1", "", "rice, 60 g (dry)"]);
});
