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

// Decided 2026-11-01: an opened file counts as a finished setup, so only a missing key stands before Make Your Meal
test("an opened profile file counts as a finished setup; with a key the profile is complete", () => {
  fakeWindow();
  const file = (data) => store.readProfileFile(JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, data })).data;
  store.openProfile(file({ name: "Marta", country: "ES" }));
  assert.equal(store.hasProfile(), true);
  assert.equal(store.needsSetup(), false);
  assert.equal(store.profileComplete(), false); // no key in the file
  store.writeApiKey("sk-ant-test");
  assert.equal(store.profileComplete(), true); // no second setup
  fakeWindow();
  store.openProfile(file({ apiKey: "sk-ant-in-file" }));
  assert.equal(store.profileComplete(), true);
});

// Create profile (decided 2026-10-22): asked once, only in a browser with nothing of the user's
test("the setup is needed only in a browser with no profile, key or name, until done or skipped", () => {
  const data = fakeWindow();
  assert.equal(store.hasProfile(), false);
  assert.equal(store.needsSetup(), true);
  store.markSetup(store.SETUP_SKIPPED);
  assert.equal(store.needsSetup(), false);
  assert.equal(store.hasProfile(), false); // skipped is not a profile: the menu still offers Create profile
  store.markSetup(store.SETUP_DONE);
  assert.equal(store.hasProfile(), true);
  for (const k of ["apiKey", "name", "profile"]) {
    const d = fakeWindow();
    d[store.KEYS[k]] = JSON.stringify(k === "profile" ? { sections: [] } : "x");
    assert.equal(store.needsSetup(), false, k);
    assert.equal(store.hasProfile(), true, k);
  }
  assert.equal(data[store.KEYS.setup], JSON.stringify("done"));
});

test("budget per meal: a positive number, else the default", () => {
  const data = fakeWindow();
  assert.equal(store.readBudget(), store.DEFAULT_BUDGET);
  assert.equal(store.writeBudget(6), true);
  assert.equal(store.readBudget(), 6);
  assert.equal(store.writeBudget(0), false);
  assert.equal(store.writeBudget(5000), false);
  data[store.KEYS.budget] = JSON.stringify("7");
  assert.equal(store.readBudget(), store.DEFAULT_BUDGET);
  // It travels in the profile file
  store.writeBudget(6.5);
  assert.equal(JSON.parse(store.exportProfile()).data.budget, 6.5);
});

// Decided 2026-11-01: saving a meal asks the browser to keep the site's storage; any answer, or none, is fine
test("askPersist asks once the storage is not kept yet, and never throws", async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const calls = [];
  const fake = (persisted, persist) => Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { storage: { persisted: async () => persisted, persist } } });
  try {
    fake(false, async () => { calls.push("persist"); return true; });
    await store.askPersist();
    assert.deepEqual(calls, ["persist"]);
    fake(true, async () => { calls.push("again"); return true; });
    await store.askPersist();
    assert.deepEqual(calls, ["persist"]); // already kept: not asked again
    fake(false, async () => { throw new Error("refused"); });
    await store.askPersist(); // no throw
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await store.askPersist(); // not supported: no throw
  } finally {
    if (had) Object.defineProperty(globalThis, "navigator", had);
    else delete globalThis.navigator;
  }
});
