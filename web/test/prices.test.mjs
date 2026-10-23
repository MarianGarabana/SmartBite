// User prices (decision P16): typed on a line for the pack it shows, kept in localStorage as a product for the user's
// store (since 2026-10-21), shared by every meal. Checks the storage helpers, the cart totals with prices, the
// products sent to /api/evaluate, and that a request without products is unchanged. fetch and localStorage are mocked; no server is called.
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

const { priceKey, productsFor, withPrices } = await import("../lib/cartmath.js");
const { categoriesOf, demoIdea, estimateTitle, periodText, toMeal } = await import("../lib/meal.js");
const { consolidate } = await import("../lib/cart.js");
const { evaluateMeal } = await import("../lib/engine.js");
const store = await import("../lib/store.js");

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "meals");
const load = (slug) => toMeal(slug, JSON.parse(fs.readFileSync(path.join(DEMO, `${slug}.json`), "utf8")));
const TUNA = "tuna-and-chickpea-salad-with-skyr-dressing";
const FRITTATA = "tuna-frittata-with-vegetables";

// Fake browser storage; blocked: every write throws, like a strict private window
function fakeWindow({ blocked = false } = {}) {
  const data = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { if (blocked) throw new Error("blocked"); data[k] = String(v); },
      removeItem: (k) => { delete data[k]; },
    },
    dispatchEvent: () => true, addEventListener() {}, removeEventListener() {},
  };
  return data;
}

test("price keys use the English food key and the pack weight", () => {
  assert.equal(priceKey("Canned Tuna in Water", 168), "canned tuna in water|168");
  assert.equal(priceKey("eggs", 24 * 51), "eggs|1224");
  assert.equal(priceKey("feta", 200.0000001), "feta|200");
  const eggs = load(FRITTATA).lines.find((l) => l.food === "eggs");
  assert.equal(eggs.priceKey, "eggs|1224");
});

test("withPrices prices matching lines only and returns the same meal when nothing matches", () => {
  const meal = load(TUNA);
  assert.equal(withPrices(meal, {}), meal);
  assert.equal(withPrices(meal, { "feta|200": 2 }), meal);
  const priced = withPrices(meal, { "canned tuna in water|168": 1.25 });
  const tuna = priced.lines.find((l) => l.food === "canned tuna in water");
  assert.equal(tuna.hasPrice, true);
  assert.equal(tuna.packPrice, 1.25);
  assert.equal(priced.lines.filter((l) => l.hasPrice).length, 1);
});

test("productsFor sends the user's product of each food the recipe uses and nothing else", () => {
  const meal = load(TUNA);
  const tuna = { food: "canned tuna in water", name: "Atun 3 x 80 g", sold_by: "pack", pack_grams: 240, price_eur: 2.9 };
  const lemon = { food: "lemon", name: "Limon", sold_by: "per_kg", pack_grams: 1000, price_eur: 2.2 };
  const feta = { food: "feta", name: "Feta 200 g", sold_by: "pack", pack_grams: 200, price_eur: 2 };
  assert.deepEqual(productsFor(meal.source.recipe, { lemon, feta, "canned tuna in water": tuna }), [tuna, lemon]);
  assert.deepEqual(productsFor(meal.source.recipe, {}), []);
  // Food keys of the shopping lines count too, for names the browser does not know
  assert.deepEqual(productsFor({ ingredients: [] }, { feta }, [{ foodKey: "feta" }]), [feta]);
});

test("a price typed on a line saves a product for that pack, and the cart never stores products", () => {
  const data = fakeWindow();
  const meal = load(TUNA);
  const tuna = meal.lines.find((l) => l.food === "canned tuna in water");
  const lemon = meal.lines.find((l) => l.food === "lemon");
  assert.deepEqual(store.readPrices(), {});
  assert.equal(store.setLinePrice(tuna, 1.25), true);
  assert.equal(store.setLinePrice(lemon, 0.3), true);
  assert.deepEqual(store.readPrices(), { [tuna.priceKey]: 1.25, [lemon.priceKey]: 0.3 });
  const saved = store.readProducts()["none|canned tuna in water"];
  assert.deepEqual({ ...saved, price_date: "x" }, { food: "canned tuna in water", name: tuna.product, sold_by: "pack",
    pack_grams: tuna.packSize, price_eur: 1.25, price_date: "x" });
  assert.equal(store.readProducts()["none|lemon"].sold_by, "per_kg");
  // An empty field removes the price; a product that was only a price goes
  store.setLinePrice(lemon, null);
  assert.deepEqual(store.readPrices(), { [tuna.priceKey]: 1.25 });
  assert.equal(store.readProducts()["none|lemon"], undefined);
  assert.equal(store.setLinePrice(tuna, -1), false);
  assert.equal(store.setLinePrice(tuna, 5000), false);
  assert.deepEqual(store.readPrices(), { [tuna.priceKey]: 1.25 });

  const cart = store.readCart();
  assert.deepEqual(cart.prices, { [tuna.priceKey]: 1.25 });
  assert.deepEqual(Object.keys(cart.products), ["canned tuna in water"]);
  store.writeCart({ ...cart, meals: [{ slug: TUNA }] });
  assert.deepEqual(JSON.parse(data[store.KEYS.cart]), { meals: [{ slug: TUNA }], optional: [], have: [] });
});

test("eggs: a price typed on the egg line saves a box of that many eggs", () => {
  fakeWindow();
  const eggs = load(FRITTATA).lines.find((l) => l.food === "eggs");
  assert.equal(store.setLinePrice(eggs, 5.4), true);
  const saved = store.readProducts()["none|eggs"];
  assert.equal(saved.sold_by, "per_unit");
  assert.equal(saved.units_per_pack, 24);
  assert.deepEqual(store.readPrices(), { "eggs|1224": 5.4 });
});

test("blocked storage: setLinePrice says so and reading still works", () => {
  fakeWindow({ blocked: true });
  const tuna = load(TUNA).lines.find((l) => l.food === "canned tuna in water");
  assert.equal(store.setLinePrice(tuna, 2), false);
  assert.deepEqual(store.readPrices(), {});
  delete globalThis.window;
  assert.deepEqual(store.readPrices(), {});
});

test("cart totals follow the user's prices; unpriced rows keep grams and leftovers", () => {
  const meal = load(TUNA);
  const stored = { meals: [{ slug: TUNA }], optional: [], have: [], prices: {} };
  const before = consolidate(stored, [meal]);
  assert.equal(before.totals.priced, 0);
  const bought = meal.lines.filter((l) => !l.optional && l.priceKey);
  const prices = Object.fromEntries(bought.map((l) => [l.priceKey, 1]));
  const after = consolidate({ ...stored, prices }, [meal]);
  const packs = after.rows.filter((r) => !r.optional).reduce((s, r) => s + r.packs, 0);
  assert.equal(after.totals.priced, bought.length);
  assert.equal(after.totals.unpriced, 0);
  assert.ok(Math.abs(after.totals.bought - packs) < 1e-9);
  assert.equal(after.totals.wasteGrams, before.totals.wasteGrams);

  const one = consolidate({ ...stored, prices: { [bought[0].priceKey]: 2 } }, [meal]);
  assert.equal(one.totals.priced, 1);
  assert.equal(one.totals.unpriced, bought.length - 1);
  for (const r of one.rows.filter((x) => !x.optional && !x.hasPrice)) assert.ok(r.bought > 0 && r.left >= 0);
});

test("a price is shared by every meal that buys the same pack", () => {
  const meals = [load(TUNA), load(FRITTATA)];
  const prices = { "canned tuna in water|168": 1.5 };
  const cart = consolidate({ meals: [{ slug: TUNA }, { slug: FRITTATA }], optional: [], have: [], prices }, meals);
  const tuna = cart.rows.find((r) => r.priceKey === "canned tuna in water|168");
  assert.equal(tuna.hasPrice, true);
  assert.equal(tuna.price, tuna.packs * 1.5);
});

function mockFetch(reply) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: (reply.status || 200) < 400, status: reply.status || 200, json: async () => reply.json };
  };
  return calls;
}

test("evaluateMeal sends products only when there are some", async () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const input = { form: doc.form, picked_idea: doc.picked_idea, recipe: doc.recipe };
  let calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, products: [] });
  await evaluateMeal(input);
  assert.deepEqual(Object.keys(calls[0].body), ["form", "picked_idea", "recipe"]);
  assert.deepEqual(calls[0].body, calls[1].body);
  const products = [{ food: "lemon", name: "Limon", sold_by: "per_kg", pack_grams: 1000, price_eur: 2.2 }];
  calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, products });
  assert.deepEqual(calls[0].body.products, products);
  assert.equal("prices" in calls[0].body, false);

  mockFetch({ status: 422, json: { errors: ["products[0].price_eur: must be >= 0"] } });
  await assert.rejects(evaluateMeal({ ...input, products }), /must be >= 0/);
});

// Estimated prices (decision P28): Settings country, sent to the engine, shown as est. lines that a typed price replaces
const estimatedDoc = (doc) => ({ ...doc, evaluation: { ...doc.evaluation, pack: { ...doc.evaluation.pack,
  lines: doc.evaluation.pack.lines.map((l) => (l.food === "lemon"
    ? { ...l, has_price: true, cost_bought_eur: 2.5, cost_used_eur: 0.5, price_source: "estimate", price_date: "2026-07",
      price_period: "2025-08/2026-07" } : l)) } } });

test("country is Spain by default, any country can be picked, and bad values fall back", () => {
  const data = fakeWindow();
  assert.equal(store.readCountry(), "ES");
  assert.deepEqual(store.engineEstimates(), { country: "ES", region: null });
  assert.equal(store.writeCountry("FR"), true);
  assert.equal(store.readCountry(), "FR");
  assert.deepEqual(store.engineEstimates(), { country: null, region: null }); // no estimates for France
  data[store.KEYS.country] = JSON.stringify("XX");
  assert.equal(store.readCountry(), "ES");
  store.writeCountry("XX");
  assert.equal(JSON.parse(data[store.KEYS.country]), "ES");
  assert.equal(store.COUNTRIES.length, 249);
  assert.equal(store.COUNTRIES.find((c) => c.id === "ES").label, "Spain");
  delete globalThis.window;
  assert.equal(store.readCountry(), "ES");
});

test("region: national by default, a Spanish region or off; the old country none reads as off", () => {
  const data = fakeWindow();
  assert.equal(store.readRegion(), "national");
  assert.equal(store.writeRegion("ES-MD"), true);
  assert.equal(store.readRegion(), "ES-MD");
  assert.deepEqual(store.engineEstimates(), { country: "ES", region: "ES-MD" });
  store.writeRegion("off");
  assert.deepEqual(store.engineEstimates(), { country: null, region: null });
  store.writeRegion("ES-XX");
  assert.equal(JSON.parse(data[store.KEYS.region]), "national");
  // A region of another country, or for a country with no regions, reads as national
  data[store.KEYS.region] = JSON.stringify("ES-MD");
  assert.equal(store.readRegion("FR"), "national");
  // Before 2026-10-22 "none" was a country: Spain with estimates off
  delete data[store.KEYS.region];
  data[store.KEYS.country] = JSON.stringify("none");
  assert.equal(store.readCountry(), "ES");
  assert.equal(store.readRegion(), "off");
  assert.deepEqual(store.engineEstimates(), { country: null, region: null });
  assert.equal(store.regionLabel("ES-MD"), "Comunidad de Madrid");
});

test("the browser's regions are the engine's regions", () => {
  const es = JSON.parse(fs.readFileSync(path.resolve(DEMO, "..", "..", "..", "data", "open", "prices", "es.json"), "utf8"));
  assert.deepEqual(Object.fromEntries(store.REGIONS.ES.map((r) => [r.id, r.label])),
    Object.fromEntries(Object.entries(es.regions).map(([id, r]) => [id, r.name])));
});

test("evaluateMeal sends country and region only when given", async () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const input = { form: doc.form, picked_idea: doc.picked_idea, recipe: doc.recipe };
  const calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, country: "ES" });
  await evaluateMeal({ ...input, country: null, region: "ES-MD" });
  await evaluateMeal({ ...input, country: "ES", region: "ES-MD" });
  assert.equal(calls[0].body.country, "ES");
  assert.equal("region" in calls[0].body, false);
  assert.deepEqual(Object.keys(calls[1].body), ["form", "picked_idea", "recipe"]);
  assert.equal(calls[2].body.region, "ES-MD");
});

test("estimated lines are marked and a typed price replaces the estimate", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const meal = toMeal(TUNA, estimatedDoc(doc));
  const lemon = meal.lines.find((l) => l.food === "lemon");
  assert.equal(lemon.hasPrice, true);
  assert.equal(lemon.estimate, true);
  assert.equal(lemon.packPrice, 2.5);
  assert.equal(lemon.pricePeriod, "2025-08/2026-07");
  assert.equal(lemon.priceRegion, null);
  assert.equal(meal.lines.filter((l) => l.estimate).length, 1);
  const typed = withPrices(meal, { [lemon.priceKey]: 3.1 }).lines.find((l) => l.food === "lemon");
  assert.equal(typed.estimate, false);
  assert.equal(typed.packPrice, 3.1);
  // Demo meals saved without a country have no estimates
  assert.equal(load(TUNA).lines.some((l) => l.estimate), false);
});

test("estimate tooltip names the source and the period", () => {
  assert.equal(periodText("2025-08/2026-07"), "Aug 2025 to Jul 2026");
  assert.equal(periodText("2025-08", "2026-07"), "Aug 2025 to Jul 2026");
  assert.equal(periodText("bad"), null);
  assert.equal(estimateTitle("2025-08/2026-07"), "Estimated: Spain average price paid, MAPA, Aug 2025 to Jul 2026");
  assert.equal(estimateTitle("2025-08/2026-07", "ES-MD"),
    "Estimated: Comunidad de Madrid average price paid, MAPA, Aug 2025 to Jul 2026");
});

test("every demo meal has a category, and each category has a demo meal", () => {
  const meals = fs.readdirSync(DEMO).map((f) => load(f.replace(/\.json$/, "")));
  const names = ["Breakfast", "Lunch", "Dinner", "Salads", "Warm Meals"];
  for (const name of names) assert.ok(meals.some((m) => m.categories.includes(name)), name);
  for (const m of meals) assert.equal(m.category, m.categories[0]);
  assert.deepEqual(categoriesOf("Carrot cake overnight oats with berries"), ["Breakfast"]);
  assert.deepEqual(categoriesOf("Tuna and chickpea salad with skyr dressing"), ["Salads", "Lunch", "Dinner"]);
  assert.deepEqual(categoriesOf("Mild chicken breast curry with rice"), ["Warm Meals", "Lunch", "Dinner"]);
});

test("a demo idea card shows the meal, not the idea it started from", () => {
  const stew = load("classic-lentil-stew-with-chickpeas-and-chicken");
  assert.equal(stew.idea.name, "Classic lentil stew with chickpeas"); // the saved idea drifted from the recipe
  const card = demoIdea(stew);
  assert.equal(card.name, stew.name);
  assert.deepEqual(card.rough_macros, stew.perServing);
  assert.deepEqual(card.main_ingredients, stew.ingredients.map((it) => it.name));
  assert.match(card.one_line, /^Dried lentils, .* and [a-z ]+\.$/);
});
