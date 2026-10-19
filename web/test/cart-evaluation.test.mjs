// The Cart uses the same engine evaluation as the recipe page (same servings, prices, country), so packs, estimates,
// totals and Adjust leftovers match it. The engine reply is a fixture here (the Korean beef bowl run for 1 serving
// with Spain estimates, values from smartbite_engine.meal.evaluate); no server is called.
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
const { mealRequest, withPrices } = await import("../lib/cartmath.js");
const { packRow, totals } = await import("../lib/packs.js");
const { adjustApply, adjustInfo, cartJobs, consolidate } = await import("../lib/cart.js");
const { leftoverView } = await import("../lib/leftovers.js");

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "meals");
const KOREAN = "korean-beef-bowl-with-peas-and-brown-rice-lentil-mix";
const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${KOREAN}.json`), "utf8"));
const saved = toMeal(KOREAN, doc);

// The engine's reply for 1 serving with country ES: ground beef 1 x 300 g (the saved meal, run for 8 servings,
// buys 2 x 400 g), and Spain estimates on frozen peas, dried lentils and garlic
const ONE = { "ground beef": [1, 300, null], "frozen peas": [1, 1000, 2.15], "brown rice": [1, 1000, null],
  "dried lentils": [1, 1000, 2.4], "spring onion": [1, 90, null], garlic: [1, 36, 0.25] };
const oneServing = {
  ...doc,
  form: { ...doc.form, servings: 1 },
  evaluation: { ...doc.evaluation, pack: { ...doc.evaluation.pack, lines: doc.evaluation.pack.lines.map((l) => {
    const [packs, bought, cost] = ONE[l.ingredient] || [l.packs_to_buy, l.grams_bought, null];
    return { ...l, grams_needed: l.grams_needed / 8, packs_to_buy: packs, grams_bought: packs * bought,
      product_name: `${l.ingredient} ${bought} g`, has_price: cost != null, cost_bought_eur: cost,
      price_source: cost != null ? "estimate" : "typical", price_period: cost != null ? "2025-08/2026-07" : null };
  }) } },
};
const evaluatedOne = toMeal(KOREAN, oneServing);
const stored = (meals, prices = {}) => ({ meals, optional: [], have: [], prices });

// What the recipe page shows for 1 serving from the same reply (components/RecipePage.jsx)
const recipeRows = (meal, prices, servings) =>
  withPrices(meal, prices).lines.map((l) => packRow(l, (l.needed * servings) / meal.servings));

test("the recipe page and the Cart send the same engine request for a meal and servings", () => {
  const jobs = cartJobs(stored([{ slug: KOREAN, servings: 1 }]), [saved]);
  assert.deepEqual(jobs.map((j) => [j.id, j.meal.slug, j.servings]), [[`${KOREAN}#1`, KOREAN, 1]]);
  const prices = { "ground beef|300": 4.99 };
  const fromCart = mealRequest(jobs[0].meal, jobs[0].servings, prices, "ES");
  assert.deepEqual(fromCart, mealRequest(saved, 1, prices, "ES"));
  assert.equal(fromCart.form.servings, 1);
  assert.deepEqual(fromCart.prices, [{ food: "ground beef", pack_grams: 300, price_eur: 4.99 }]);
  assert.equal(fromCart.country, "ES");
  // An entry without servings runs for the meal's own
  assert.equal(cartJobs(stored([{ slug: KOREAN }]), [saved])[0].servings, 8);
});

test("Cart rows use the entry's evaluation: same packs, estimates and total as the recipe page", () => {
  const prices = { "ground beef|300": 4.99 };
  const cart = consolidate(stored([{ slug: KOREAN, servings: 1 }], prices), [saved], { [`${KOREAN}#1`]: evaluatedOne });
  const beef = cart.rows.find((r) => r.ingredient === "ground beef");
  assert.equal(beef.packSize, 300);
  assert.equal(beef.packs, 1);
  assert.equal(beef.price, 4.99);
  const peas = cart.rows.find((r) => r.ingredient === "frozen peas");
  assert.equal(peas.estimate, true);
  assert.equal(peas.price, 2.15);

  const page = recipeRows(evaluatedOne, prices, 1);
  const pick = (rows) => rows.filter((r) => !r.optional).map((r) => [r.ingredient, r.packSize, r.packs, r.needed, r.price]);
  assert.deepEqual(pick(cart.rows), pick(page));
  const t = totals(page);
  assert.ok(Math.abs(cart.totals.bought - t.bought) < 1e-9);
  assert.ok(Math.abs(cart.totals.bought - (4.99 + 2.15 + 2.4 + 0.25)) < 1e-9);

  // Before its reply is in, the entry uses the saved meal (packs picked for 8 servings)
  const before = consolidate(stored([{ slug: KOREAN, servings: 1 }], prices), [saved]);
  assert.equal(before.rows.find((r) => r.ingredient === "ground beef").packSize, 400);
});

test("Adjust leftovers starts from the Cart's rows and never stores the evaluation ref", () => {
  const evaluated = { [`${KOREAN}#1`]: evaluatedOne };
  const s = stored([{ slug: KOREAN, servings: 1 }]);
  const cart = consolidate(s, [saved], evaluated);
  const info = adjustInfo(s, [saved], evaluated);
  assert.equal(info.before.wasteGrams, cart.totals.wasteGrams);
  assert.ok(Math.abs(info.before.bought - cart.totals.bought) < 1e-9);
  const applied = adjustApply(s, [saved], info.suggestions.map((x) => x.id), evaluated);
  for (const e of applied.meals) assert.equal("ref" in e, false);
});

test("two entries of one meal get their own evaluation", () => {
  const s = stored([{ slug: KOREAN, servings: 1 }, { slug: KOREAN, servings: 8 }]);
  assert.deepEqual(cartJobs(s, [saved]).map((j) => [j.id, j.servings]), [[`${KOREAN}#1`, 1], [`${KOREAN}#2`, 8]]);
  const cart = consolidate(s, [saved], { [`${KOREAN}#1`]: evaluatedOne });
  // 300 g pack for the 1-serving entry, the saved 400 g packs for the 8-serving one
  const beef = cart.rows.filter((r) => r.ingredient === "ground beef").map((r) => [r.packSize, r.needed]);
  assert.deepEqual(beef.sort((a, b) => a[0] - b[0]), [[300, 100], [400, 800]]);
});

test("recipes that use a leftover match by food, whatever pack size their saved meal shows", () => {
  const rows = [{ key: "ground beef|300", ingredient: "ground beef", packSize: 300, left: 200, leftCost: null, status: "Use in 2 days" }];
  const other = { slug: "other", name: "Beef chili", kind: "demo", lines: [{ key: "ground beef|400", ingredient: "ground beef" }] };
  const view = leftoverView(rows, [other], []);
  assert.deepEqual(view.leftoverRecipes.map((r) => [r.slug, r.uses]), [["other", ["ground beef"]]]);
});
