// Demo and real split (decided 2026-10-30): /demo has the demo meals and its own cart; the real app at / has only the
// meals made in this browser, and its Make Your Meal runs once the profile is complete. localStorage is mocked.
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
const { modeMeals, recipeMeals } = await import("../lib/meal.js");
const { tabUrl } = await import("../lib/site.js");
const { DEFAULT_PROFILE, setField } = await import("../lib/profile.js");

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

test("tab addresses: the real app at /, the demo at /demo, home without ?tab=", () => {
  assert.equal(tabUrl("home"), "/");
  assert.equal(tabUrl("cart"), "/?tab=cart");
  assert.equal(tabUrl("home", true), "/demo");
  assert.equal(tabUrl("make-meal", true), "/demo?tab=make-meal");
});

test("the demo lists only demo meals; the real app only meals made here, My Recipes only the saved ones", () => {
  const meals = [
    { slug: "d1", kind: "demo" }, { slug: "d2", kind: "demo" },
    { slug: "mine", kind: "local", saved: true }, { slug: "draft", kind: "local", saved: false },
  ];
  const slugs = (list) => list.map((m) => m.slug);
  assert.deepEqual(slugs(modeMeals(meals, true)), ["d1", "d2"]);
  assert.deepEqual(slugs(modeMeals(meals, false)), ["mine", "draft"]);
  assert.deepEqual(slugs(recipeMeals(meals, true)), ["d1", "d2"]);
  assert.deepEqual(slugs(recipeMeals(meals, false)), ["mine"]);
});

test("the demo cart has its own key: adding there never touches the real cart, and it is not in the profile file", () => {
  const data = fakeWindow();
  assert.equal(store.cartKey(), store.KEYS.cart);
  assert.equal(store.cartKey(true), store.KEYS.demoCart);
  assert.notEqual(store.KEYS.demoCart, store.KEYS.cart);
  store.writeCart({ ...store.readCart(), meals: [{ slug: "mine" }] });
  store.writeCart({ ...store.readCart(true), meals: [{ slug: "d1", servings: 2 }] }, true);
  assert.deepEqual(store.readCart().meals, [{ slug: "mine" }]);
  assert.deepEqual(store.readCart(true).meals, [{ slug: "d1", servings: 2 }]);
  assert.deepEqual(JSON.parse(data[store.KEYS.demoCart]), { meals: [{ slug: "d1", servings: 2 }], optional: [], have: [] });
  assert.deepEqual(JSON.parse(store.exportProfile()).data.cart.meals, [{ slug: "mine" }]);
  assert.equal("demoCart" in JSON.parse(store.exportProfile()).data, false);
});

test("profile complete: a ready provider and the setup finished once", () => {
  const data = fakeWindow();
  assert.equal(store.profileComplete(), false); // new visitor
  store.markSetup(store.SETUP_DONE);
  assert.equal(store.profileComplete(), false); // setup finished, key skipped
  store.writeApiKey("sk-ant-test");
  assert.equal(store.profileComplete(), true);
  store.markSetup(store.SETUP_SKIPPED);
  assert.equal(store.profileComplete(), false); // skipped is not finished
  store.clearApiKey();
  store.markSetup(store.SETUP_DONE);
  // An endpoint that needs no key (Ollama) counts as ready
  store.writeLlmSettings({ provider: "openai_compatible", openai: { preset: "ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.1" } });
  assert.equal(store.profileComplete(), true);
  assert.equal(data[store.KEYS.apiKey], undefined);
});

test("migration: a key and saved targets from before the rule count as complete, without the setup", () => {
  const data = fakeWindow();
  store.writeApiKey("sk-ant-old");
  assert.equal(store.profileComplete(), false); // a key alone is not enough
  store.writeProfile(setField(setField(DEFAULT_PROFILE, "kcal_target", 520), "protein_g_target", 40));
  assert.equal(data[store.KEYS.setup], undefined);
  assert.equal(store.profileComplete(), true);
  assert.equal(data[store.KEYS.setup], undefined); // reading never writes
  // A saved profile without a usable target, or an odd shape, does not count
  store.writeProfile(setField(DEFAULT_PROFILE, "kcal_target", null));
  assert.equal(store.profileComplete(), false);
  data[store.KEYS.profile] = JSON.stringify({ sections: [{ id: "x" }] });
  assert.equal(store.profileComplete(), false);
  // Targets without a key: not complete
  store.writeProfile(DEFAULT_PROFILE);
  store.clearApiKey();
  assert.equal(store.profileComplete(), false);
});
