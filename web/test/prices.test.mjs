// User prices (decision P16): typed per food and pack weight, kept in localStorage, shared by every meal. Checks the
// storage helpers, the cart totals with prices, the list sent to /api/evaluate, and that a request without prices
// is unchanged. fetch and localStorage are mocked; no server is called.
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

const { priceKey, pricesFor, withPrices } = await import("../lib/cartmath.js");
const { estimateTitle, periodText, toMeal } = await import("../lib/meal.js");
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

test("pricesFor sends every stored size of the meal's foods and nothing else", () => {
  const meal = load(TUNA);
  const list = pricesFor(meal, { "canned tuna in water|168": 1.25, "canned tuna in water|480": 3.5, "feta|200": 2, "lemon|1000": 2.2 });
  assert.deepEqual(list, [
    { food: "canned tuna in water", pack_grams: 168, price_eur: 1.25 },
    { food: "canned tuna in water", pack_grams: 480, price_eur: 3.5 },
    { food: "lemon", pack_grams: 1000, price_eur: 2.2 },
  ]);
  assert.deepEqual(pricesFor(meal, {}), []);
});

test("prices persist under their own key, bad values are dropped, and the cart never stores them", () => {
  const data = fakeWindow();
  assert.deepEqual(store.readPrices(), {});
  assert.equal(store.setPrice("canned tuna in water", 168, 1.25), true);
  assert.equal(store.setPrice("lemon", 1000, 2.2), true);
  assert.deepEqual(store.readPrices(), { "canned tuna in water|168": 1.25, "lemon|1000": 2.2 });
  store.setPrice("lemon", 1000, null);
  assert.deepEqual(store.readPrices(), { "canned tuna in water|168": 1.25 });
  store.setPrice("feta", 200, -1);
  store.setPrice("feta", 200, 5000);
  assert.deepEqual(Object.keys(store.readPrices()), ["canned tuna in water|168"]);
  data[store.KEYS.prices] = JSON.stringify({ "eggs|612": "3", nokey: 1, "feta|200": 2 });
  assert.deepEqual(store.readPrices(), { "feta|200": 2 });
  data[store.KEYS.prices] = "{broken";
  assert.deepEqual(store.readPrices(), {});

  store.setPrice("feta", 200, 2);
  const cart = store.readCart();
  assert.deepEqual(cart.prices, { "feta|200": 2 });
  store.writeCart({ ...cart, meals: [{ slug: TUNA }] });
  assert.deepEqual(JSON.parse(data[store.KEYS.cart]), { meals: [{ slug: TUNA }], optional: [], have: [] });
});

test("blocked storage: setPrice says so and reading still works", () => {
  fakeWindow({ blocked: true });
  assert.equal(store.setPrice("feta", 200, 2), false);
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

test("evaluateMeal sends prices only when there are some", async () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const input = { form: doc.form, picked_idea: doc.picked_idea, recipe: doc.recipe };
  let calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, prices: [] });
  await evaluateMeal(input);
  assert.deepEqual(Object.keys(calls[0].body), ["form", "picked_idea", "recipe"]);
  assert.deepEqual(calls[0].body, calls[1].body);
  const prices = [{ food: "lemon", pack_grams: 1000, price_eur: 2.2 }];
  calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, prices });
  assert.deepEqual(calls[0].body.prices, prices);

  mockFetch({ status: 422, json: { errors: ["prices[0].price_eur: must be >= 0"] } });
  await assert.rejects(evaluateMeal({ ...input, prices }), /must be >= 0/);
});

// Estimated prices (decision P28): Settings country, sent to the engine, shown as est. lines that a typed price replaces
const estimatedDoc = (doc) => ({ ...doc, evaluation: { ...doc.evaluation, pack: { ...doc.evaluation.pack,
  lines: doc.evaluation.pack.lines.map((l) => (l.food === "lemon"
    ? { ...l, has_price: true, cost_bought_eur: 2.5, cost_used_eur: 0.5, price_source: "estimate", price_date: "2026-07",
      price_period: "2025-08/2026-07" } : l)) } } });

test("country is Spain by default, can be none, and bad values fall back", () => {
  const data = fakeWindow();
  assert.equal(store.readCountry(), "ES");
  assert.equal(store.engineCountry(store.readCountry()), "ES");
  assert.equal(store.writeCountry("none"), true);
  assert.equal(store.readCountry(), "none");
  assert.equal(store.engineCountry("none"), null);
  data[store.KEYS.country] = JSON.stringify("FR");
  assert.equal(store.readCountry(), "ES");
  store.writeCountry("XX");
  assert.equal(JSON.parse(data[store.KEYS.country]), "ES");
  delete globalThis.window;
  assert.equal(store.readCountry(), "ES");
});

test("evaluateMeal sends country only when given", async () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const input = { form: doc.form, picked_idea: doc.picked_idea, recipe: doc.recipe };
  const calls = mockFetch({ json: doc });
  await evaluateMeal({ ...input, country: "ES" });
  await evaluateMeal({ ...input, country: null });
  assert.equal(calls[0].body.country, "ES");
  assert.deepEqual(Object.keys(calls[1].body), ["form", "picked_idea", "recipe"]);
});

test("estimated lines are marked and a typed price replaces the estimate", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DEMO, `${TUNA}.json`), "utf8"));
  const meal = toMeal(TUNA, estimatedDoc(doc));
  const lemon = meal.lines.find((l) => l.food === "lemon");
  assert.equal(lemon.hasPrice, true);
  assert.equal(lemon.estimate, true);
  assert.equal(lemon.packPrice, 2.5);
  assert.equal(lemon.pricePeriod, "2025-08/2026-07");
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
});
