// Browser storage: everything the user keeps lives in this browser's localStorage. No accounts, no server copy.
// Every access is wrapped in try/catch: storage can be blocked (private windows, strict settings) and the site
// must still work for the visit.
import { priceKey } from "./cartmath";
import { DEFAULT_PROFILE, mergeProfile } from "./profile";
import { ANTHROPIC, DEFAULT_ANTHROPIC_MODEL, OPENAI_COMPATIBLE, OPENAI_PRESETS, presetById } from "./providers";

export const KEYS = {
  cart: "smartbite.cart", // { meals: [{ slug, servings, grams?, baseServings? }], optional: [key], have: [key] }
  saved: "smartbite.saved", // slugs of local meals saved in My Recipes
  meals: "smartbite.meals", // { slug: Meal result } made in this browser
  profile: "smartbite.profile", // Kitchen Profile (lib/profile.js)
  apiKey: "smartbite.anthropicKey", // the user's own Anthropic key, sent only to api.anthropic.com
  openaiKey: "smartbite.openaiKey", // key for the OpenAI-compatible endpoint, sent only to that endpoint
  llm: "smartbite.llm", // { provider, anthropicModel, openai: { preset, baseUrl, model } }, no keys in here
  prices: "smartbite.prices", // { "<food key>|<pack grams>": EUR per pack } typed by the user, shared by all meals
  country: "smartbite.country", // "ES" or "none": estimated prices for lines without a typed price
};
const CHANGED = "smartbite-storage";

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// false when the browser refused to store it (the change still lives in the page until reload)
export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  } finally {
    try { window.dispatchEvent(new Event(CHANGED)); } catch {}
  }
}

function remove(key) {
  try { window.localStorage.removeItem(key); } catch {}
  try { window.dispatchEvent(new Event(CHANGED)); } catch {}
}

// Calls back on changes from this tab (CHANGED) and from other tabs (storage); returns the unsubscribe
export function onStoreChange(callback) {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
}

const list = (v) => (Array.isArray(v) ? v : []);

// The cart carries the user's prices too (read from their own key), so cart totals follow a price typed anywhere
export function readCart() {
  const c = readJson(KEYS.cart, {}) || {};
  return {
    meals: list(c.meals).filter((e) => e && typeof e.slug === "string"),
    optional: list(c.optional),
    have: list(c.have),
    prices: readPrices(),
  };
}

// Prices live under their own key, never inside the cart
export const writeCart = ({ prices: _prices, ...cart }) => writeJson(KEYS.cart, cart);

export const MAX_PRICE_EUR = 1000; // same limit as docs/contracts/evaluate.schema.json

const okPrice = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE_EUR;

// { "<food key>|<pack grams>": EUR per pack }; anything else in storage is dropped
export function readPrices() {
  const p = readJson(KEYS.prices, {});
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  return Object.fromEntries(Object.entries(p).filter(([k, v]) => k.includes("|") && okPrice(v)));
}

// Price of one pack of a food; null (or a bad value) removes it. false when the browser refused to store it.
export function setPrice(food, packGrams, price) {
  const { [priceKey(food, packGrams)]: _old, ...rest } = readPrices();
  return writeJson(KEYS.prices, okPrice(price) ? { ...rest, [priceKey(food, packGrams)]: price } : rest);
}

// Estimated prices (engine, docs/contracts/evaluate.schema.json "country"): average prices paid in a country fill
// the lines the user did not price. Spain unless the user picks none.
export const COUNTRIES = [
  { id: "ES", label: "Spain", source: "MAPA" },
  { id: "none", label: "None (no estimates)" },
];
export const DEFAULT_COUNTRY = "ES";

// "ES" or "none"; anything else in storage gives the default
export function readCountry() {
  const c = readJson(KEYS.country, DEFAULT_COUNTRY);
  return COUNTRIES.some((x) => x.id === c) ? c : DEFAULT_COUNTRY;
}

export const writeCountry = (id) => writeJson(KEYS.country, COUNTRIES.some((x) => x.id === id) ? id : DEFAULT_COUNTRY);

// What /api/evaluate takes: the country code, or null for no estimates
export const engineCountry = (id) => (id && id !== "none" && COUNTRIES.some((x) => x.id === id) ? id : null);

export const readSaved = () => list(readJson(KEYS.saved, []));

export function setSaved(slug, on) {
  const slugs = readSaved().filter((s) => s !== slug);
  return writeJson(KEYS.saved, on ? [...slugs, slug] : slugs);
}

export function readLocalMeals() {
  const meals = readJson(KEYS.meals, {});
  return meals && typeof meals === "object" && !Array.isArray(meals) ? meals : {};
}

export const saveLocalMeal = (slug, doc) => writeJson(KEYS.meals, { ...readLocalMeals(), [slug]: doc });

// Delete a meal made in this browser: it leaves My Recipes and the cart too
export function deleteLocalMeal(slug) {
  const { [slug]: _gone, ...rest } = readLocalMeals();
  const cart = readCart();
  return writeJson(KEYS.meals, rest) && setSaved(slug, false)
    && writeCart({ ...cart, meals: cart.meals.filter((e) => e.slug !== slug) });
}

export function readProfile() {
  const p = readJson(KEYS.profile, null);
  return p && Array.isArray(p.sections) ? mergeProfile(p) : DEFAULT_PROFILE;
}

export const writeProfile = (profile) => writeJson(KEYS.profile, profile);
export const resetProfile = () => remove(KEYS.profile);

export function readApiKey() {
  const k = readJson(KEYS.apiKey, "");
  return typeof k === "string" ? k : "";
}

export const writeApiKey = (key) => writeJson(KEYS.apiKey, key.trim());
export const clearApiKey = () => remove(KEYS.apiKey);

export function readOpenAiKey() {
  const k = readJson(KEYS.openaiKey, "");
  return typeof k === "string" ? k : "";
}

export const writeOpenAiKey = (key) => writeJson(KEYS.openaiKey, key.trim());
export const clearOpenAiKey = () => remove(KEYS.openaiKey);

// Provider settings without keys: { provider, anthropicModel, openai: { preset, baseUrl, model } }
export function readLlmSettings() {
  const s = readJson(KEYS.llm, {}) || {};
  const o = s.openai || {};
  const preset = presetById(o.preset);
  return {
    provider: s.provider === OPENAI_COMPATIBLE ? OPENAI_COMPATIBLE : ANTHROPIC,
    anthropicModel: typeof s.anthropicModel === "string" && s.anthropicModel ? s.anthropicModel : DEFAULT_ANTHROPIC_MODEL,
    openai: {
      preset: OPENAI_PRESETS.some((p) => p.id === o.preset) ? o.preset : preset.id,
      baseUrl: typeof o.baseUrl === "string" ? o.baseUrl : preset.baseUrl,
      model: typeof o.model === "string" ? o.model : preset.model,
    },
  };
}

export const writeLlmSettings = (settings) => writeJson(KEYS.llm, settings);

// What lib/llm.js needs for the chosen provider: { provider, model, baseUrl, apiKey }
export function readLlm() {
  const s = readLlmSettings();
  if (s.provider === OPENAI_COMPATIBLE) {
    return { provider: OPENAI_COMPATIBLE, model: s.openai.model.trim(), baseUrl: s.openai.baseUrl.trim(), apiKey: readOpenAiKey(),
      preset: s.openai.preset };
  }
  return { provider: ANTHROPIC, model: s.anthropicModel, baseUrl: null, apiKey: readApiKey() };
}

// True when Make Your Meal can call a model; false keeps the demo mode
export function llmReady(llm) {
  if (!llm) return false;
  if (llm.provider === ANTHROPIC) return Boolean(llm.apiKey);
  const preset = presetById(llm.preset);
  return Boolean(llm.baseUrl && llm.model && (llm.apiKey || !preset.keyNeeded));
}
