// Shareable recipe link (decided 2026-11-09): every demo meal goes into a link and comes back the same, the link stays
// short, nothing personal goes in, and a broken or crafted link is refused. Pure functions from lib/share.js.
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";

// lib/*.js import each other without ".js" (Next.js resolves that); add it for node
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (specifier.startsWith(".") && !specifier.endsWith(".js")) return next(specifier + ".js", context);
    throw e;
  }
}`));

const { ShareError, cleanPayload, decodeShare, encodeShare, sharePayload, sharedRequest, sharedSlug, shareUrl } =
  await import("../lib/share.js");
const { toMeal } = await import("../lib/meal.js");
const { validateOutput } = await import("../lib/contracts.js");
const { SITE_URL } = await import("../lib/site.js");

const DIR = path.join(import.meta.dirname, "..", "demo", "meals");
const DEMO = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => toMeal(f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))));

test("every demo meal goes into a link and comes back the same", async () => {
  assert.ok(DEMO.length >= 10);
  for (const meal of DEMO) {
    const payload = sharePayload(meal);
    const code = await encodeShare(payload);
    assert.deepEqual(await decodeShare(code), payload, meal.slug);
    assert.deepEqual(await decodeShare(`#${code}`), payload, `${meal.slug} with the #`);
    // the recipe in the link is the saved recipe, field for field (idea_id aside)
    const { idea_id: _id, ...saved } = meal.source.recipe;
    assert.deepEqual(payload.recipe, saved, meal.slug);
  }
});

test("every demo link is under 2,000 characters on the live site's address", async () => {
  for (const meal of DEMO) {
    const url = shareUrl(SITE_URL, await encodeShare(sharePayload(meal)));
    assert.ok(url.length < 2000, `${meal.slug}: ${url.length} characters`);
    assert.match(url, /^https:\/\/[^#]+\/r#[A-Za-z0-9_-]+$/);
  }
});

test("nothing about the sender goes in: no country, prices, products, budget, craving or foods to avoid", async () => {
  for (const meal of DEMO) {
    const payload = sharePayload(meal);
    assert.deepEqual(Object.keys(payload).sort(), ["idea", "recipe", "targets", "v"]);
    const json = JSON.stringify(payload);
    for (const word of ["budget", "craving", "exclude", "price", "country", "region", "product", "profile", "eur"]) {
      assert.ok(!json.includes(`"${word}`), `${meal.slug} has ${word}`);
    }
  }
});

test("the opener's engine request follows the recipe and idea contracts", async () => {
  for (const meal of DEMO) {
    const payload = await decodeShare(await encodeShare(sharePayload(meal)));
    const req = sharedRequest(payload, { budgetPerServing: 5.5 });
    assert.deepEqual(validateOutput(req.recipe, "recipe.schema.json"), [], meal.slug);
    assert.deepEqual(validateOutput(req.picked_idea, "idea.schema.json", "Idea"), [], meal.slug);
    assert.equal(req.form.servings, payload.recipe.servings);
    assert.equal(req.form.kcal_target, meal.targets.kcal);
    assert.equal(req.form.protein_g_target, meal.targets.protein);
    assert.equal(req.form.budget_total_eur, Math.round(5.5 * payload.recipe.servings * 2) / 2);
    assert.deepEqual(req.form.exclude, []);
  }
});

test("a recipe shared without targets or main foods still makes a valid request", () => {
  const payload = cleanPayload({ v: 1, recipe: { title: "Toast", servings: 1, prep_time_min: 5, steps: ["Toast it."],
    ingredients: [{ name: "bread", grams_per_serving: 60, units_per_serving: 0, storage: "fresh", pantry: false, dry: false }] } });
  const req = sharedRequest(payload, { budgetPerServing: 3 });
  assert.equal(req.form.kcal_target, 450);
  assert.equal(req.form.protein_g_target, 45);
  assert.equal(req.picked_idea.main_ingredients.length, 2);
  assert.deepEqual(validateOutput(req.picked_idea, "idea.schema.json", "Idea"), []);
  assert.deepEqual(validateOutput(req.recipe, "recipe.schema.json"), []);
});

test("unknown fields in a link are dropped", () => {
  const out = cleanPayload({ v: 1, evil: "<script>", recipe: { title: "Toast", servings: 1, prep_time_min: 5, steps: ["Toast."],
    photo: "https://evil.example/x.png", ingredients: [{ name: "bread", grams_per_serving: 60, units_per_serving: 0,
      storage: "fresh", pantry: false, dry: false, price: 9 }] }, idea: { one_line: "", main_ingredients: [], image_prompt: "",
    rough_macros: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }, cost: 3 } });
  assert.equal(JSON.stringify(out).includes("evil"), false);
  assert.equal(JSON.stringify(out).includes("price"), false);
  assert.equal(JSON.stringify(out).includes("cost"), false);
});

test("broken, cut-off, oversized or crafted links are refused with a ShareError", async () => {
  const code = await encodeShare(sharePayload(DEMO[0]));
  const bad = ["", "#", "not base64!", code.slice(0, code.length / 2), `${code}%%`, "A".repeat(9000)];
  for (const c of bad) await assert.rejects(decodeShare(c), ShareError, JSON.stringify(c.slice(0, 20)));
  // a link that unzips into far more than a recipe (zip bomb) stops early
  const bomb = await encodeShare({ v: 1, pad: "x".repeat(2_000_000) });
  assert.ok(bomb.length < 8000);
  await assert.rejects(decodeShare(bomb), ShareError);
  // valid zip, wrong content
  for (const raw of [{ v: 2 }, { v: 1 }, [], { v: 1, recipe: { title: "x", servings: 99, prep_time_min: 1, steps: ["a"],
    ingredients: [{ name: "a", grams_per_serving: 1, storage: "fresh" }] } }, { v: 1, recipe: { title: "x", servings: 1,
    prep_time_min: 1, steps: ["a"], ingredients: [{ name: "a", grams_per_serving: -5, storage: "fresh" }] } }]) {
    await assert.rejects(decodeShare(await encodeShare(raw)), ShareError, JSON.stringify(raw).slice(0, 60));
  }
});

test("the same link opens the same meal address; another link another one", async () => {
  const a = await encodeShare(sharePayload(DEMO[0]));
  const b = await encodeShare(sharePayload(DEMO[1]));
  assert.equal(sharedSlug("Crème brûlée oats!", a), sharedSlug("Crème brûlée oats!", a));
  assert.notEqual(sharedSlug("Same", a), sharedSlug("Same", b));
  assert.match(sharedSlug("Crème brûlée oats!", a), /^creme-brulee-oats-shared-[a-z0-9]+$/);
});
