// Browser storage: everything the user keeps lives in this browser's localStorage. No accounts, no server copy.
// Every access is wrapped in try/catch: storage can be blocked (private windows, strict settings) and the site
// must still work for the visit.
import { PACK_SIZES } from "../generated/index.js";
import { EGG_GRAMS, norm, priceKey } from "./cartmath";
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
  // Before 2026-10-21: { "<food key>|<pack grams>": EUR per pack }. Read only to make the first products
  // (migratePrices), then left as it is, as a backup
  prices: "smartbite.prices",
  products: "smartbite.products", // { "<store id>|<food key>": product (docs/contracts/evaluate.schema.json Product) }
  store: "smartbite.store", // supermarket id (STORES), "other:<name>", or "none"
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

// The cart carries the user's products for their store and their prices too (read from their own keys), so cart
// totals follow a price typed anywhere
export function readCart() {
  const c = readJson(KEYS.cart, {}) || {};
  const products = readActiveProducts();
  return {
    meals: list(c.meals).filter((e) => e && typeof e.slug === "string"),
    optional: list(c.optional),
    have: list(c.have),
    products,
    prices: productPrices(products),
  };
}

// Products and prices live under their own keys, never inside the cart
export const writeCart = ({ prices: _prices, products: _products, ...cart }) => writeJson(KEYS.cart, cart);

export const MAX_PRICE_EUR = 1000; // same limit as docs/contracts/evaluate.schema.json

const okPrice = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE_EUR;

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const today = () => new Date().toISOString().slice(0, 10);

// Old typed prices, { "<food key>|<pack grams>": EUR per pack }; anything else in storage is dropped
function readOldPrices() {
  const p = readJson(KEYS.prices, {});
  if (!isObject(p)) return {};
  return Object.fromEntries(Object.entries(p).filter(([k, v]) => k.includes("|") && okPrice(v)));
}

// Supermarkets per country (decided 2026-10-21). The store only labels the user's own products: no store site is
// ever contacted. "Other" keeps a name the user types, as "other:<name>".
export const STORES = {
  ES: [
    { id: "mercadona", label: "Mercadona" }, { id: "carrefour", label: "Carrefour" }, { id: "lidl", label: "Lidl" },
    { id: "dia", label: "Dia" }, { id: "alcampo", label: "Alcampo" }, { id: "eroski", label: "Eroski" },
    { id: "aldi", label: "Aldi" }, { id: "consum", label: "Consum" },
  ],
};
export const NO_STORE = "none";
const MAX_STORE_NAME = 40;
const STORE_IDS = new Set(Object.values(STORES).flat().map((s) => s.id));

// A store id as kept: a known id, "other:<name>" with a short name, or "none"
export function okStore(id) {
  if (id === NO_STORE || STORE_IDS.has(id)) return id;
  if (typeof id === "string" && id.startsWith("other:")) {
    const name = id.slice(6).trim().slice(0, MAX_STORE_NAME);
    return name ? `other:${name}` : NO_STORE;
  }
  return NO_STORE;
}

export const storeLabel = (id) => (id === NO_STORE ? "No store"
  : id.startsWith("other:") ? id.slice(6) : Object.values(STORES).flat().find((s) => s.id === id)?.label || id);

export const readStore = () => okStore(readJson(KEYS.store, NO_STORE));
export const writeStore = (id) => writeJson(KEYS.store, okStore(id));

// One product as kept and sent to the engine (docs/contracts/evaluate.schema.json Product), or null when it breaks
// a rule. Only the contract's fields are kept; the food key is the plain English key.
const LABEL_MAX = { kcal: 900, protein_g: 100, carbs_g: 100, fat_g: 100, fiber_g: 100, salt_g: 100 };
const LABEL_REQUIRED = ["kcal", "protein_g", "carbs_g", "fat_g"];
const num = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function okLabel(l) {
  if (!isObject(l)) return null;
  if (!LABEL_REQUIRED.every((k) => num(l[k], 0, LABEL_MAX[k]))) return null;
  return Object.fromEntries(Object.keys(LABEL_MAX).filter((k) => num(l[k], 0, LABEL_MAX[k])).map((k) => [k, l[k]]));
}

export function okProduct(p) {
  if (!isObject(p) || typeof p.food !== "string" || typeof p.name !== "string") return null;
  const food = norm(p.food);
  const name = p.name.trim();
  if (!food || food.length > 100 || !name || name.length > 120) return null;
  const out = { food, name, sold_by: p.sold_by };
  if (p.sold_by === "per_unit") {
    if (!Number.isInteger(p.units_per_pack) || p.units_per_pack < 1 || p.units_per_pack > 100) return null;
    out.units_per_pack = p.units_per_pack;
  } else if (p.sold_by === "pack" || p.sold_by === "per_kg") {
    if (!(num(p.pack_grams, 0, 100000) && p.pack_grams > 0)) return null;
    out.pack_grams = p.pack_grams;
  } else return null;
  if (p.price_eur != null) {
    if (!okPrice(p.price_eur)) return null;
    out.price_eur = p.price_eur;
    if (typeof p.price_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.price_date)) out.price_date = p.price_date;
  }
  if (p.barcode != null) {
    if (typeof p.barcode !== "string" || !/^\d{8,14}$/.test(p.barcode)) return null;
    out.barcode = p.barcode;
  }
  if (p.per_100g != null) {
    const label = okLabel(p.per_100g);
    if (!label) return null;
    out.per_100g = label;
  }
  return out;
}

// Weight of one pack as a line shows it (cartmath priceKey): grams, or units x 51 g for eggs
export const packWeight = (p) => (p.sold_by === "per_unit" ? p.units_per_pack * EGG_GRAMS : p.pack_grams);

// The generic name the engine gives a typical pack (smartbite_engine/generic_packs.py _name)
function typicalName(food, soldBy, grams, units) {
  if (soldBy === "per_unit") return `${food} clase M ${units} uds`;
  if (soldBy === "per_kg") return `${food}, loose (${grams} g)`;
  return `${food} ${grams} g`;
}

// Old typed prices as no-store products: one per food (a product is the only pack option), the size with the
// lowest price per gram when several were typed. sold_by from the typical pack sizes.
export function migratePrices(prices, packs = PACK_SIZES) {
  const best = {};
  for (const [key, price] of Object.entries(prices)) {
    const cut = key.lastIndexOf("|");
    const food = norm(key.slice(0, cut));
    const grams = Number(key.slice(cut + 1));
    if (!food || !(grams > 0)) continue;
    const soldBy = packs[food]?.sold_by || "pack";
    const units = Math.round(grams / EGG_GRAMS);
    const size = soldBy === "per_unit" ? { units_per_pack: units } : { pack_grams: grams };
    const product = okProduct({ food, name: typicalName(food, soldBy, grams, units), sold_by: soldBy, ...size,
      price_eur: price });
    if (!product) continue;
    const perGram = price / grams;
    if (!best[food] || perGram < best[food].perGram) best[food] = { perGram, product };
  }
  return Object.fromEntries(Object.entries(best).map(([food, b]) => [`${NO_STORE}|${food}`, b.product]));
}

// { "<store id>|<food key>": product }; bad entries dropped. Before the first product is saved, the old typed prices
// show as no-store products (nothing written here: reading never writes)
export function readProducts() {
  const raw = readJson(KEYS.products, null);
  if (!isObject(raw)) return migratePrices(readOldPrices());
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const product = okProduct(value);
    const store = key.slice(0, key.lastIndexOf("|"));
    if (product && okStore(store) === store && key === `${store}|${product.food}`) out[key] = product;
  }
  return out;
}

// { food key: product } for a store: that store's product, else the no-store one. Other stores never count.
export function activeProducts(products, store) {
  const out = {};
  for (const want of [NO_STORE, store]) {
    for (const [key, p] of Object.entries(products)) if (key.slice(0, key.lastIndexOf("|")) === want) out[p.food] = p;
  }
  return out;
}

export const readActiveProducts = () => activeProducts(readProducts(), readStore());

// { "<food key>|<pack weight>": EUR per pack } of priced products, for pricing lines in the browser at once
export function productPrices(active) {
  return Object.fromEntries(Object.values(active).filter((p) => p.price_eur != null)
    .map((p) => [priceKey(p.food, packWeight(p)), p.price_eur]));
}

// Prices of the user's products for their store
export const readPrices = () => productPrices(readActiveProducts());

const writeProducts = (products) => writeJson(KEYS.products, products);

// Save (or replace) the product of one food for a store; false when it breaks a rule or storage is blocked
export function saveProduct(store, product) {
  const p = okProduct(product);
  if (!p) return false;
  return writeProducts({ ...readProducts(), [`${okStore(store)}|${p.food}`]: p });
}

export function deleteProduct(store, food) {
  const { [`${okStore(store)}|${norm(food)}`]: _gone, ...rest } = readProducts();
  return writeProducts(rest);
}

// Price typed on a shopping line (recipe page or Cart). A price goes to the product of the user's store for that
// food: a copy of the no-store one, or a new product for the pack the line shows. An empty field (null) removes
// the price from the product that gave it; a product that was only a price then goes. false when not stored.
// line: { foodKey, product, soldBy, packSize, unitsPerPack } (lib/meal.js lines)
export function setLinePrice(line, price, store = readStore()) {
  const food = norm(line.foodKey);
  if (!food) return false;
  const products = readProducts();
  const own = `${store}|${food}`;
  const fallback = `${NO_STORE}|${food}`;
  if (okPrice(price)) {
    const units = line.unitsPerPack || Math.round(line.packSize / EGG_GRAMS);
    const fromLine = { food, name: line.product || food, sold_by: line.soldBy || "pack",
      ...(line.soldBy === "per_unit" ? { units_per_pack: units } : { pack_grams: line.packSize }) };
    const base = products[own] || products[fallback] || fromLine;
    const p = okProduct({ ...base, price_eur: price, price_date: today() });
    return p ? writeProducts({ ...products, [own]: p }) : false;
  }
  if (price !== null) return false;
  const key = products[own] ? own : products[fallback] ? fallback : null;
  if (!key) return true;
  const { price_eur: _p, price_date: _d, ...rest } = products[key];
  const { [key]: _old, ...others } = products;
  return writeProducts(rest.per_100g || rest.barcode ? { ...others, [key]: rest } : others);
}

export const MAX_PRODUCTS = 1000;

// Products as a file to keep (Settings "Export products") and back: { app, kind, version, exported, products }.
// Import adds to the products kept here; the same store and food is replaced by the file's.
export function exportProducts() {
  return JSON.stringify({ app: "SmartBite", kind: "products", version: 1, exported: today(), products: readProducts() },
    null, 1);
}

// { ok, added, skipped, error? }: the file must be a SmartBite products export; bad entries are skipped and counted
export function importProducts(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, added: 0, skipped: 0, error: "This file is not JSON." };
  }
  if (!isObject(data) || data.app !== "SmartBite" || data.kind !== "products" || !isObject(data.products)) {
    return { ok: false, added: 0, skipped: 0, error: "This is not a SmartBite products file." };
  }
  const add = {};
  let skipped = 0;
  for (const [key, value] of Object.entries(data.products)) {
    const p = okProduct(value);
    const store = key.slice(0, key.lastIndexOf("|"));
    if (p && okStore(store) === store) add[`${store}|${p.food}`] = p;
    else skipped += 1;
  }
  const merged = { ...readProducts(), ...add };
  if (Object.keys(merged).length > MAX_PRODUCTS) {
    return { ok: false, added: 0, skipped, error: `Too many products: at most ${MAX_PRODUCTS}.` };
  }
  const ok = writeProducts(merged);
  return { ok, added: ok ? Object.keys(add).length : 0, skipped, ...(ok ? {} : { error: "This browser blocks storage." }) };
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
