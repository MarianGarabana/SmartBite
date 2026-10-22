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
