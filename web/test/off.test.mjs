// Barcode lookup on Open Food Facts (slice 2): what is sent, how a reply fills the product, and the limits. fetch is
// mocked with small hand-made replies; no request leaves the machine.
import assert from "node:assert/strict";
import test from "node:test";

const { LookupError, OFF_PRODUCT_URL, eggCount, lookupBarcode, parseProduct, resetLookups } = await import("../lib/off.js");

const reply = (product, status = 1) => ({ status, product });
const fakeFetch = (res, calls = []) => async (url, init) => {
  calls.push({ url, init });
  if (res instanceof Error) throw res;
  const status = res.status ?? 200;
  return { ok: status >= 200 && status < 300, status, json: async () => res.json };
};

test("a product fills name with brand, pack grams and the label per 100 g", () => {
  const got = parseProduct(reply({ product_name: "Garbanzos cocidos", brands: "Marca Uno,Otra", quantity: "400 g",
    product_quantity: 400, product_quantity_unit: "g",
    nutriments: { "energy-kcal_100g": 115, proteins_100g: 7.04, carbohydrates_100g: 12.6, fat_100g: 2.3, fiber_100g: 5,
      salt_100g: 0.6 } }));
  assert.deepEqual(got, { name: "Garbanzos cocidos, Marca Uno", packGrams: 400, packFromMl: false, eggs: null,
    quantity: "400 g", per_100g: { kcal: 115, protein_g: 7, carbs_g: 12.6, fat_g: 2.3, fiber_g: 5, salt_g: 0.6 } });
});

test("missing or odd values are left out, kcal comes from kJ, ml is flagged", () => {
  const got = parseProduct(reply({ product_name_es: "Leche semidesnatada Marca", brands: "marca", quantity: "1 l",
    product_quantity: "1000", product_quantity_unit: "ml",
    nutriments: { "energy-kj_100g": 192, proteins_100g: 3.1, carbohydrates_100g: -1, fat_100g: 1600 } }));
  assert.equal(got.name, "Leche semidesnatada Marca"); // brand already in the name
  assert.equal(got.packGrams, 1000);
  assert.equal(got.packFromMl, true);
  assert.deepEqual(got.per_100g, { kcal: 45.9, protein_g: 3.1 });
  assert.equal(parseProduct(reply({ product_name: "", quantity: "" })).packGrams, null);
});

test("not on Open Food Facts is null", () => {
  assert.equal(parseProduct({ status: 0, status_verbose: "product not found" }), null);
  assert.equal(parseProduct(null), null);
});

test("eggs per box from the quantity text", () => {
  assert.equal(eggCount("12"), 12);
  assert.equal(eggCount("6 huevos"), 6);
  assert.equal(eggCount("12 unidades"), 12);
  assert.equal(eggCount("x10"), 10);
  assert.equal(eggCount("700 g"), null);
  assert.equal(eggCount("0"), null);
  assert.equal(eggCount(null), null);
});

test("a lookup sends only the barcode, with X-User-Agent SmartBite", async () => {
  resetLookups();
  const calls = [];
  const got = await lookupBarcode(" 8480000123456 ", { fetch: fakeFetch({ json: reply({ product_name: "Atún" }) }, calls) });
  assert.equal(got.name, "Atún");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, `${OFF_PRODUCT_URL}8480000123456.json`);
  assert.deepEqual([...url.searchParams.keys()], ["fields"]);
  assert.deepEqual(calls[0].init, { headers: { "X-User-Agent": "SmartBite" } });
});

test("lookup errors are plain messages; not found is null", async () => {
  resetLookups();
  await assert.rejects(lookupBarcode("123"), LookupError);
  assert.equal(await lookupBarcode("12345678", { fetch: fakeFetch({ status: 404, json: { status: 0 } }) }), null);
  assert.equal(await lookupBarcode("12345678", { fetch: fakeFetch({ json: { status: 0 } }) }), null);
  await assert.rejects(lookupBarcode("12345678", { fetch: fakeFetch({ status: 429 }) }), /busy/);
  await assert.rejects(lookupBarcode("12345678", { fetch: fakeFetch({ status: 503 }) }), /busy/);
  await assert.rejects(lookupBarcode("12345678", { fetch: fakeFetch({ status: 500 }) }), /answered 500/);
  await assert.rejects(lookupBarcode("12345678", { fetch: fakeFetch(new TypeError("offline")) }), /Could not reach/);
});

test("at most 10 lookups a minute, and one at a time", async () => {
  resetLookups();
  let t = 0;
  const opts = { fetch: fakeFetch({ json: { status: 0 } }), now: () => t };
  for (let i = 0; i < 10; i++) await lookupBarcode("12345678", opts);
  await assert.rejects(lookupBarcode("12345678", opts), /Too many lookups/);
  t = 61000;
  assert.equal(await lookupBarcode("12345678", opts), null);

  resetLookups();
  let release;
  const slow = () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ status: 0 }) }); });
  const first = lookupBarcode("12345678", { fetch: slow });
  await assert.rejects(lookupBarcode("12345678", { fetch: slow }), /already running/);
  release();
  assert.equal(await first, null);
});
