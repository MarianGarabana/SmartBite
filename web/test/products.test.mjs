// User products (decided 2026-10-21; no supermarkets since 2026-11-09): one product per food in localStorage, used
// wherever the user shops. Products saved per store before then read as one per food, the newest price first. Old
// typed prices become no-store products without being deleted. Export and import keep products across browsers.
// localStorage is mocked; no server is called.
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

const store = await import("../lib/store.js");

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

const chickpeas = (extra = {}) => ({ food: "canned chickpeas", name: "Garbanzos cocidos 570 g", sold_by: "pack",
  pack_grams: 570, ...extra });
const LABEL = { kcal: 60, protein_g: 11, carbs_g: 3.5, fat_g: 0.2 };

test("old typed prices show as no-store products and stay in their own key", () => {
  const data = fakeWindow();
  const old = { "canned tuna in water|168": 1.5, "canned tuna in water|480": 3.5, "eggs|612": 2.9, "lemon|58": 0.3,
    "feta|200": "2", nokey: 1 };
  data[store.KEYS.prices] = JSON.stringify(old);
  const products = store.readProducts();
  assert.deepEqual(Object.keys(products).sort(), ["none|canned tuna in water", "none|eggs", "none|lemon"]);
  // Several sizes typed: the lowest price per gram (480 g at 3.50 beats 168 g at 1.50)
  assert.deepEqual(products["none|canned tuna in water"], { food: "canned tuna in water",
    name: "canned tuna in water 480 g", sold_by: "pack", pack_grams: 480, price_eur: 3.5 });
  assert.deepEqual(products["none|eggs"], { food: "eggs", name: "eggs clase M 12 uds", sold_by: "per_unit",
    units_per_pack: 12, price_eur: 2.9 });
  assert.equal(products["none|lemon"].sold_by, "per_kg");
  assert.deepEqual(store.readPrices(), { "canned tuna in water|480": 3.5, "eggs|612": 2.9, "lemon|58": 0.3 });
  // Reading never writes; the first save keeps the migrated products and the old key stays as it was
  assert.equal(store.KEYS.products in data, false);
  store.saveProduct("none", chickpeas());
  assert.equal(Object.keys(store.readProducts()).length, 4);
  assert.deepEqual(JSON.parse(data[store.KEYS.prices]), old);
});

test("products saved per supermarket before 2026-11-09 read as one per food, the newest price first", () => {
  const data = fakeWindow();
  data[store.KEYS.store] = JSON.stringify("lidl");
  data[store.KEYS.products] = JSON.stringify({
    "none|canned chickpeas": chickpeas({ price_eur: 1.2, price_date: "2026-10-01" }),
    "mercadona|canned chickpeas": chickpeas({ pack_grams: 400, price_eur: 0.9, price_date: "2026-10-20" }),
    "lidl|lemon": { food: "lemon", name: "Limon", sold_by: "per_kg", pack_grams: 1000, price_eur: 2, price_date: "2026-10-05" },
    "carrefour|lemon": { food: "lemon", name: "Limon", sold_by: "per_kg", pack_grams: 1000, price_eur: 2.4, price_date: "2026-10-05" },
    "walmart|feta": chickpeas({ food: "feta" }), // unknown store: dropped
  });
  const products = store.readProducts();
  assert.deepEqual(Object.keys(products).sort(), ["none|canned chickpeas", "none|lemon"]);
  assert.equal(products["none|canned chickpeas"].pack_grams, 400); // newest date wins
  assert.equal(products["none|lemon"].price_eur, 2); // same date: the store that was picked wins
  assert.equal(store.readStore(), "none"); // the old choice no longer applies
  assert.deepEqual(store.readPrices(), { "canned chickpeas|400": 0.9, "lemon|1000": 2 });
  assert.deepEqual(store.readCart().products, { "canned chickpeas": products["none|canned chickpeas"], lemon: products["none|lemon"] });
  // The first save writes the merged products back
  store.saveProduct(store.readStore(), { food: "feta", name: "Feta 200 g", sold_by: "pack", pack_grams: 200 });
  assert.deepEqual(Object.keys(JSON.parse(data[store.KEYS.products])).sort(), ["none|canned chickpeas", "none|feta", "none|lemon"]);
});

test("a price typed on a shopping line goes to the user's product; clearing keeps a label", () => {
  fakeWindow();
  store.saveProduct("none", chickpeas({ per_100g: LABEL, barcode: "12345670" }));
  const line = { foodKey: "canned chickpeas", product: "canned chickpeas 400 g", soldBy: "pack", packSize: 400 };
  assert.equal(store.setLinePrice(line, 0.95), true);
  const own = store.readProducts()["none|canned chickpeas"];
  // The same product (its pack, name and label), with the price
  assert.equal(own.pack_grams, 570);
  assert.deepEqual(own.per_100g, LABEL);
  assert.equal(own.price_eur, 0.95);
  assert.match(own.price_date, /^\d{4}-\d{2}-\d{2}$/);
  // Clearing the price keeps the product, since it has a label
  store.setLinePrice(line, null);
  const kept = store.readProducts()["none|canned chickpeas"];
  assert.equal(kept.price_eur, undefined);
  assert.equal(kept.price_date, undefined);
  assert.deepEqual(kept.per_100g, LABEL);
  // Nothing to clear: fine
  assert.equal(store.setLinePrice({ ...line, foodKey: "feta" }, null), true);
  assert.equal(store.setLinePrice({ ...line, foodKey: null }, 1), false);
});

test("product rules: the pack field matches sold_by, labels and barcodes are checked, extra fields dropped", () => {
  assert.deepEqual(store.okProduct(chickpeas({ food: " Canned Chickpeas ", link: "https://x/p", shop: "y" })),
    chickpeas());
  assert.equal(store.okProduct(chickpeas({ units_per_pack: 6 })).units_per_pack, undefined);
  assert.equal(store.okProduct({ food: "eggs", name: "Huevos", sold_by: "per_unit", pack_grams: 600 }), null);
  assert.equal(store.okProduct({ food: "eggs", name: "Huevos", sold_by: "per_unit", units_per_pack: 2.5 }), null);
  assert.equal(store.okProduct(chickpeas({ pack_grams: 0 })), null);
  assert.equal(store.okProduct(chickpeas({ sold_by: "box" })), null);
  assert.equal(store.okProduct(chickpeas({ name: " " })), null);
  assert.equal(store.okProduct(chickpeas({ price_eur: 1001 })), null);
  assert.equal(store.okProduct(chickpeas({ barcode: "1234567" })), null);
  assert.equal(store.okProduct(chickpeas({ per_100g: { kcal: 950, protein_g: 1, carbs_g: 1, fat_g: 1 } })), null);
  assert.equal(store.okProduct(chickpeas({ per_100g: { kcal: 100, protein_g: 1, carbs_g: 1 } })), null);
  const p = store.okProduct(chickpeas({ price_eur: 1, price_date: "21/10/2026",
    per_100g: { ...LABEL, fiber_g: 5, sugar_g: 1 } }));
  assert.equal(p.price_date, undefined);
  assert.deepEqual(p.per_100g, { ...LABEL, fiber_g: 5 });
  assert.equal(store.saveProduct("none", chickpeas({ pack_grams: -1 })), false);
});

test("export and import: a round trip keeps every product; bad files and bad entries are reported", () => {
  fakeWindow();
  store.saveProduct("none", chickpeas({ per_100g: LABEL }));
  store.saveProduct("none", { food: "feta", name: "Feta 200 g", sold_by: "pack", pack_grams: 200, price_eur: 2 });
  const file = store.exportProducts();
  const parsed = JSON.parse(file);
  assert.equal(parsed.app, "SmartBite");
  assert.equal(parsed.kind, "products");

  fakeWindow();
  store.saveProduct("none", { food: "lemon", name: "Limon", sold_by: "per_kg", pack_grams: 1000 });
  // A file from before 2026-11-09 can carry store keys: they become one product per food, the newest price first
  const bad = { ...parsed, products: { ...parsed.products, "mercadona|canned chickpeas": chickpeas({ price_eur: 0.9, price_date: "2026-10-20" }),
    "none|eggs": { food: "eggs" }, "walmart|lemon": chickpeas() } };
  const out = store.importProducts(JSON.stringify(bad));
  assert.deepEqual(out, { ok: true, added: 2, skipped: 2 });
  assert.deepEqual(Object.keys(store.readProducts()).sort(), ["none|canned chickpeas", "none|feta", "none|lemon"]);
  assert.equal(store.readProducts()["none|canned chickpeas"].price_eur, 0.9);
  assert.match(store.importProducts("{broken").error, /not JSON/);
  assert.match(store.importProducts(JSON.stringify({ app: "Other", products: {} })).error, /not a SmartBite products/);

  fakeWindow({ blocked: true });
  assert.deepEqual(store.importProducts(file), { ok: false, added: 0, skipped: 0, error: "This browser blocks storage." });
});
