// Browser storage: everything the user keeps lives in this browser's localStorage. No accounts, no server copy.
// Every access is wrapped in try/catch: storage can be blocked (private windows, strict settings) and the site
// must still work for the visit.
import { PACK_SIZES } from "../generated/index.js";
import { EGG_GRAMS, norm, priceKey } from "./cartmath";
import { DEFAULT_PROFILE, fieldValue, mergeProfile } from "./profile";
import { ANTHROPIC, DEFAULT_ANTHROPIC_MODEL, OPENAI_COMPATIBLE, OPENAI_PRESETS, presetById } from "./providers";

export const KEYS = {
  cart: "smartbite.cart", // { meals: [{ slug, servings, grams?, baseServings? }], optional: [key], have: [key] }
  demoCart: "smartbite.demoCart", // the cart of /demo, same shape: playing with the demo never touches the real cart
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
  country: "smartbite.country", // ISO country code ("none" before 2026-10-22: Spain, estimates off)
  region: "smartbite.region", // estimated prices: "national", "off" or a region code such as "ES-MD"
  currency: "smartbite.currency", // ISO 4217 code shown with prices (symbol only, no conversion); unset: the country's
  name: "smartbite.name", // display name on the Profile page and in the profile menu, optional
  budget: "smartbite.budget", // budget per meal (one serving) in the user's currency: the Make Your Meal starting value
  setup: "smartbite.setup", // "done" or "skipped": the Create profile setup was finished or skipped once
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

// The demo (/demo and the demo recipe pages) keeps its own cart; it is not in the profile file
export const cartKey = (demo = false) => (demo ? KEYS.demoCart : KEYS.cart);

// The cart carries the user's products for their store and their prices too (read from their own keys), so cart
// totals follow a price typed anywhere
export function readCart(demo = false) {
  const c = readJson(cartKey(demo), {}) || {};
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
export const writeCart = ({ prices: _prices, products: _products, ...cart }, demo = false) => writeJson(cartKey(demo), cart);

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
    if (p.label_source === "open_food_facts") out.label_source = p.label_source; // else typed by the user
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

// Profile file (decided 2026-10-22): what this browser keeps for SmartBite, in one file to keep or to move to another
// browser. Not in it: photos (IndexedDB, MBs each) and the API keys, unless the user ticks "include my key". Opening a
// file replaces each part below (missing parts are cleared); the keys are replaced only when the file has them.
// Each part is checked for its shape here; the readers check the details when they read it.
const PROFILE_PARTS = { profile: isObject, llm: isObject, country: (v) => typeof v === "string",
  region: (v) => typeof v === "string", currency: (v) => typeof v === "string", store: (v) => typeof v === "string",
  name: (v) => typeof v === "string", budget: (v) => typeof v === "number", products: isObject, meals: isObject,
  saved: Array.isArray, cart: isObject };
const KEY_PARTS = { apiKey: (v) => typeof v === "string", openaiKey: (v) => typeof v === "string" };
export const MAX_PROFILE_FILE = 4_000_000; // bytes; localStorage holds about 5 MB per site

export function exportProfile({ withKeys = false } = {}) {
  const parts = { ...PROFILE_PARTS, ...(withKeys ? KEY_PARTS : {}) };
  const data = {};
  for (const part of Object.keys(parts)) {
    const value = readJson(KEYS[part], undefined);
    if (value !== undefined && value !== "") data[part] = value;
  }
  return JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, exported: today(), data }, null, 1);
}

// What a profile file holds, before opening it: { ok, error?, data, summary: { name, meals, products, keys } }
export function readProfileFile(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not JSON." };
  }
  if (!isObject(file) || file.app !== "SmartBite" || file.kind !== "profile" || !isObject(file.data)) {
    return { ok: false, error: "This is not a SmartBite profile file." };
  }
  if (file.version !== 1) return { ok: false, error: "This profile file is from a newer SmartBite. Update the page and try again." };
  const parts = { ...PROFILE_PARTS, ...KEY_PARTS };
  const bad = Object.entries(file.data).filter(([part, v]) => parts[part] && !parts[part](v)).map(([part]) => part);
  if (bad.length) return { ok: false, error: `This profile file is damaged (${bad.join(", ")}).` };
  const d = file.data;
  return { ok: true, data: d, summary: { name: typeof d.name === "string" ? d.name : "",
    meals: isObject(d.meals) ? Object.keys(d.meals).length : 0, products: isObject(d.products) ? Object.keys(d.products).length : 0,
    keys: Object.keys(KEY_PARTS).some((k) => typeof d[k] === "string" && d[k]) } };
}

// Replaces this browser's profile with a file read by readProfileFile. false when the browser refused to store it.
export function openProfile(data) {
  let ok = true;
  for (const part of Object.keys(PROFILE_PARTS)) {
    if (part in data) ok = writeJson(KEYS[part], data[part]) && ok;
    else remove(KEYS[part]);
  }
  for (const part of Object.keys(KEY_PARTS)) {
    if (typeof data[part] === "string" && data[part]) ok = writeJson(KEYS[part], data[part]) && ok;
  }
  return ok;
}

// Country (any): picks the supermarket list and, where SmartBite has them, estimated prices (engine,
// docs/contracts/evaluate.schema.json "country"): average prices paid fill the lines the user did not price. Only
// Spain has them (MAPA), nationally or per comunidad autonoma. Labels come from the browser (Intl), in English.
const ISO_COUNTRIES = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR " +
  "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET " +
  "FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ " +
  "IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML " +
  "MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS " +
  "PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL " +
  "TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");
const countryName = (code) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};
export const COUNTRIES = ISO_COUNTRIES.map((id) => ({ id, label: countryName(id), ...(id === "ES" ? { source: "MAPA" } : {}) }))
  .sort((a, b) => a.label.localeCompare(b.label, "en"));
export const DEFAULT_COUNTRY = "ES";

// Regions with their own estimated prices (data/open/prices/es.json "regions", ISO 3166-2; the engine's region enum)
export const REGIONS = {
  ES: [
    { id: "ES-AN", label: "Andalucía" }, { id: "ES-AR", label: "Aragón" }, { id: "ES-AS", label: "Asturias" },
    { id: "ES-CN", label: "Canarias" }, { id: "ES-CB", label: "Cantabria" }, { id: "ES-CM", label: "Castilla-La Mancha" },
    { id: "ES-CL", label: "Castilla y León" }, { id: "ES-CT", label: "Cataluña" }, { id: "ES-MD", label: "Comunidad de Madrid" },
    { id: "ES-VC", label: "Comunitat Valenciana" }, { id: "ES-EX", label: "Extremadura" }, { id: "ES-GA", label: "Galicia" },
    { id: "ES-IB", label: "Illes Balears" }, { id: "ES-RI", label: "La Rioja" }, { id: "ES-NC", label: "Navarra" },
    { id: "ES-PV", label: "País Vasco" }, { id: "ES-MC", label: "Región de Murcia" },
  ],
};
export const NATIONAL = "national"; // the country's average
export const ESTIMATES_OFF = "off"; // only the prices the user types
export const hasEstimates = (country) => !!REGIONS[country];
export const regionLabel = (id) => Object.values(REGIONS).flat().find((r) => r.id === id)?.label || null;

const okCountry = (id) => COUNTRIES.some((x) => x.id === id);

// A country code; anything else in storage gives the default. Before 2026-10-22 "none" meant Spain with no estimates.
export function readCountry() {
  const c = readJson(KEYS.country, DEFAULT_COUNTRY);
  return okCountry(c) ? c : DEFAULT_COUNTRY;
}

export const writeCountry = (id) => writeJson(KEYS.country, okCountry(id) ? id : DEFAULT_COUNTRY);

// "national", "off" or one of the country's regions; the old country "none" reads as "off"
export function readRegion(country = readCountry()) {
  const r = readJson(KEYS.region, null);
  if (r === NATIONAL || r === ESTIMATES_OFF || (REGIONS[country] || []).some((x) => x.id === r)) return r;
  return readJson(KEYS.country, null) === "none" ? ESTIMATES_OFF : NATIONAL;
}

export const writeRegion = (id) => writeJson(KEYS.region,
  id === ESTIMATES_OFF || Object.values(REGIONS).flat().some((x) => x.id === id) ? id : NATIONAL);

// Currency (decided 2026-10-22): follows the country unless the user picks another; it only changes the symbol shown,
// nothing is converted. Estimated prices are in the country's own currency, so they apply only when the user's matches.
const EURO = ("AD AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA AX GF GP MQ RE YT PM BL MF")
  .split(" ");
const COUNTRY_CURRENCY = { ...Object.fromEntries(EURO.map((c) => [c, "EUR"])), GB: "GBP", US: "USD", CH: "CHF", LI: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", RS: "RSD", TR: "TRY", UA: "UAH",
  CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU", EC: "USD", PA: "USD", SV: "USD",
  AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", SG: "SGD", IN: "INR", IL: "ILS", AE: "AED",
  SA: "SAR", ZA: "ZAR", MA: "MAD", EG: "EGP", NG: "NGN", KE: "KES", TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", VN: "VND" };
export const ESTIMATE_CURRENCY = { ES: "EUR" }; // data/open/prices/<country>.json "currency"
export const DEFAULT_CURRENCY = "EUR";
export const currencyFor = (country) => COUNTRY_CURRENCY[country] || null;
const okCurrency = (c) => typeof c === "string" && /^[A-Z]{3}$/.test(c) && currencySymbol(c) !== null;

// "€", "£", "$", "CHF"; null for a code the browser does not know
export function currencySymbol(code) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).formatToParts(1)
      .find((p) => p.type === "currency")?.value ?? null;
  } catch {
    return null;
  }
}

// Every currency the browser knows, as { id, label }, sorted by name
export function currencies() {
  let codes;
  try {
    codes = Intl.supportedValuesOf("currency");
  } catch {
    codes = [...new Set(Object.values(COUNTRY_CURRENCY))];
  }
  const names = (() => { try { return new Intl.DisplayNames(["en"], { type: "currency" }); } catch { return null; } })();
  return codes.map((id) => ({ id, label: `${names?.of(id) || id} (${currencySymbol(id) || id})` }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

// The saved currency, else the country's, else EUR
export function readCurrency(country = readCountry()) {
  const c = readJson(KEYS.currency, null);
  return okCurrency(c) ? c : currencyFor(country) || DEFAULT_CURRENCY;
}

export const writeCurrency = (code) => writeJson(KEYS.currency, okCurrency(code) ? code : DEFAULT_CURRENCY);

const MAX_NAME = 40;
export const readName = () => {
  const n = readJson(KEYS.name, "");
  return typeof n === "string" ? n.trim().slice(0, MAX_NAME) : "";
};
export const writeName = (name) => writeJson(KEYS.name, String(name || "").trim().slice(0, MAX_NAME));

// Budget per meal (decided 2026-10-22): only the Make Your Meal starting value (x servings); never in a prompt
export const DEFAULT_BUDGET = 5.5;
const MAX_BUDGET = 1000;
export function readBudget() {
  const b = readJson(KEYS.budget, null);
  return typeof b === "number" && b > 0 && b <= MAX_BUDGET ? b : DEFAULT_BUDGET;
}
export const writeBudget = (b) => (typeof b === "number" && b > 0 && b <= MAX_BUDGET ? writeJson(KEYS.budget, b) : false);

// Create profile (decided 2026-10-22): a browser "has a profile" once the setup was finished or it holds the user's
// own things (a Kitchen Profile, a name, a key). The setup opens on the first "Show me 4 ideas" only when it has
// none and the setup was never finished or skipped.
export const SETUP_DONE = "done";
export const SETUP_SKIPPED = "skipped";
const hasValue = (key) => { const v = readJson(key, null); return v !== null && v !== ""; };
export const hasProfile = () => readJson(KEYS.setup, null) === SETUP_DONE
  || [KEYS.profile, KEYS.name, KEYS.apiKey, KEYS.openaiKey].some(hasValue);
export const needsSetup = () => !hasProfile() && readJson(KEYS.setup, null) !== SETUP_SKIPPED;
export const markSetup = (state) => writeJson(KEYS.setup, state === SETUP_DONE ? SETUP_DONE : SETUP_SKIPPED);

// Profile complete (decided 2026-10-30): the real Make Your Meal runs only then; before, it shows Set up profile or
// Try the demo. The rule: the chosen provider is ready (llmReady: a saved key, or an endpoint that needs none) AND
// either the setup was finished once (KEYS.setup "done") or a Kitchen Profile with a calories and a protein target is
// saved. The second half is the migration: browsers that saved a key and targets before this rule (in the Profile
// page, or before the setup existed) count as complete on load and are never sent back through the setup.
export function profileComplete() {
  if (!llmReady(readLlm())) return false;
  if (readJson(KEYS.setup, null) === SETUP_DONE) return true;
  const saved = readJson(KEYS.profile, null);
  const target = (id) => { try { return Number(fieldValue(saved, id)) > 0; } catch { return false; } }; // odd shapes: no
  return Boolean(saved && Array.isArray(saved.sections) && target("kcal_target") && target("protein_g_target"));
}

// What /api/evaluate takes: { country, region } with null for none (no estimates, or the national average)
export function engineEstimates(country = readCountry(), region = readRegion(country), currency = readCurrency(country)) {
  if (!hasEstimates(country) || region === ESTIMATES_OFF || ESTIMATE_CURRENCY[country] !== currency) {
    return { country: null, region: null };
  }
  return { country, region: (REGIONS[country] || []).some((x) => x.id === region) ? region : null };
}

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
