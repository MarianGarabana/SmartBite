// Profile (was Settings, decided 2026-10-22): display name and currency kept in this browser. The currency only
// changes the symbol; estimated prices apply only when it is the estimates' own currency. localStorage is mocked.
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

function fakeWindow() {
  const data = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; },
    },
    dispatchEvent: () => true, addEventListener() {}, removeEventListener() {},
  };
  return data;
}

test("currency follows the country until the user picks one", () => {
  const data = fakeWindow();
  assert.equal(store.readCurrency(), "EUR"); // Spain by default
  store.writeCountry("GB");
  assert.equal(store.readCurrency(), "GBP");
  store.writeCountry("CH");
  assert.equal(store.readCurrency(), "CHF");
  store.writeCountry("KI"); // no currency known for this country: the default
  assert.equal(store.readCurrency(), "EUR");
  store.writeCurrency("USD");
  assert.equal(store.readCurrency(), "USD");
  store.writeCurrency("XYZ1");
  assert.equal(JSON.parse(data[store.KEYS.currency]), "EUR");
  data[store.KEYS.currency] = JSON.stringify(42);
  store.writeCountry("SE");
  assert.equal(store.readCurrency(), "SEK");
});

test("currency symbols and the list come from the browser", () => {
  assert.equal(store.currencySymbol("EUR"), "€");
  assert.equal(store.currencySymbol("GBP"), "£");
  assert.equal(store.currencySymbol("USD"), "$");
  assert.equal(store.currencySymbol("CHF"), "CHF");
  assert.equal(store.currencySymbol("nope"), null);
  const list = store.currencies();
  assert.ok(list.length > 100);
  assert.ok(list.some((c) => c.id === "EUR" && c.label === "Euro (€)"));
  assert.equal(store.currencyFor("ES"), "EUR");
  assert.equal(store.currencyFor("US"), "USD");
  assert.equal(store.currencyFor("KI"), null);
});

test("Spain's estimates apply only while the currency is EUR", () => {
  fakeWindow();
  store.writeRegion("ES-MD");
  assert.deepEqual(store.engineEstimates(), { country: "ES", region: "ES-MD" });
  store.writeCurrency("GBP");
  assert.deepEqual(store.engineEstimates(), { country: null, region: null });
  store.writeCurrency("EUR");
  assert.deepEqual(store.engineEstimates(), { country: "ES", region: "ES-MD" });
});

test("display name is optional, trimmed and at most 40 characters", () => {
  const data = fakeWindow();
  assert.equal(store.readName(), "");
  assert.equal(store.writeName("  Marta  "), true);
  assert.equal(store.readName(), "Marta");
  store.writeName("x".repeat(60));
  assert.equal(store.readName().length, 40);
  data[store.KEYS.name] = JSON.stringify({ not: "a name" });
  assert.equal(store.readName(), "");
});

// Profile file (decided 2026-10-22): everything but photos; keys only when asked; opening replaces
test("a profile file holds the profile, shop, products, meals and cart, and the key only when asked", () => {
  const data = fakeWindow();
  store.writeName("Marta");
  store.writeCountry("GB");
  store.writeApiKey("sk-ant-test");
  data[store.KEYS.meals] = JSON.stringify({ "my-bowl": { form: {} } });
  data[store.KEYS.saved] = JSON.stringify(["my-bowl"]);
  data[store.KEYS.cart] = JSON.stringify({ meals: [{ slug: "my-bowl", servings: 2 }] });
  const file = JSON.parse(store.exportProfile());
  assert.equal(file.app, "SmartBite");
  assert.equal(file.kind, "profile");
  assert.equal(file.version, 1);
  assert.deepEqual(Object.keys(file.data).sort(), ["cart", "country", "meals", "name", "saved"]);
  assert.equal("apiKey" in file.data, false);
  const withKey = JSON.parse(store.exportProfile({ withKeys: true }));
  assert.equal(withKey.data.apiKey, "sk-ant-test");
});

test("opening a profile file replaces each part, clears missing ones, and keeps the key unless the file has one", () => {
  const data = fakeWindow();
  store.writeName("Old");
  store.writeRegion("ES-MD");
  store.writeApiKey("sk-ant-old");
  const text = JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, data: { name: "Marta", country: "FR",
    meals: { a: {}, b: {} }, products: { "none|skyr": {} } } });
  const read = store.readProfileFile(text);
  assert.equal(read.ok, true);
  assert.deepEqual(read.summary, { name: "Marta", meals: 2, products: 1, keys: false });
  assert.equal(store.openProfile(read.data), true);
  assert.equal(store.readName(), "Marta");
  assert.equal(store.readCountry(), "FR");
  assert.equal(data[store.KEYS.region], undefined); // not in the file: cleared
  assert.equal(store.readApiKey(), "sk-ant-old"); // no key in the file: kept
  const keyed = store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, data: { apiKey: "sk-ant-new" } }));
  assert.equal(keyed.summary.keys, true);
  store.openProfile(keyed.data);
  assert.equal(store.readApiKey(), "sk-ant-new");
});

test("only SmartBite profile files of this version, with parts of the right shape, open", () => {
  fakeWindow();
  assert.match(store.readProfileFile("not json").error, /not JSON/);
  assert.match(store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "products", products: {} })).error, /not a SmartBite profile/);
  assert.match(store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "profile", version: 2, data: {} })).error, /newer SmartBite/);
  assert.match(store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "profile", version: 1,
    data: { saved: "x", cart: [] } })).error, /damaged \(saved, cart\)/);
  // Parts SmartBite does not know are ignored
  const out = store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, data: { other: 1 } }));
  assert.equal(out.ok, true);
  store.openProfile(out.data);
  assert.equal(globalThis.window.localStorage.getItem("smartbite.other"), null);
});
