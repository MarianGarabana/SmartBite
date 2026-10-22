// Barcode lookup on Open Food Facts, from the user's browser (decided 2026-10-21, slice 2). Only the barcode goes
// out, with X-User-Agent: SmartBite (a browser cannot set User-Agent; the OFF API allows this header). OFF data is
// ODbL 1.0: the dialog and the shopping line name the source. OFF allows 15 product reads per minute per user; this
// file allows 10, one at a time. The user always checks the pack size before saving.
export const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/";
const FIELDS = ["code", "product_name", "product_name_es", "product_name_en", "brands", "quantity", "product_quantity",
  "product_quantity_unit", "nutriments"].join(",");
const PER_MINUTE = 10;
const MAX_NAME = 120;
// Label field -> OFF nutriment, and the highest value a label can have (lib/store.js okProduct)
const NUTRIMENTS = { kcal: ["energy-kcal_100g", 900], protein_g: ["proteins_100g", 100], carbs_g: ["carbohydrates_100g", 100],
  fat_g: ["fat_100g", 100], fiber_g: ["fiber_100g", 100], salt_g: ["salt_100g", 100] };
const KJ_PER_KCAL = 4.184;

export class LookupError extends Error {}

const recent = []; // times of the lookups in the last minute
let busy = false;

const round1 = (v) => Math.round(v * 10) / 10;
const okNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

// Eggs per box from a quantity like "12", "6 huevos", "12 unidades", "x10"; null when it has no count
export function eggCount(quantity) {
  const m = String(quantity || "").toLowerCase().match(/^\s*x?\s*(\d{1,3})\s*(u|ud|uds|unid\.?|unidades|huevos|eggs|pcs|piezas)?\s*$/);
  const n = m ? Number(m[1]) : null;
  return n >= 1 && n <= 100 ? n : null;
}

// What the dialog fills from one OFF v2 product reply: { name, packGrams, packFromMl, eggs, quantity, per_100g }.
// per_100g holds only the fields the product has (kcal from kJ when only kJ is given). null: not on OFF.
export function parseProduct(data) {
  if (!data || data.status !== 1 || !data.product) return null;
  const p = data.product;
  const base = [p.product_name, p.product_name_es, p.product_name_en].map((s) => String(s || "").trim()).find(Boolean) || "";
  const brand = String(p.brands || "").split(",")[0].trim();
  const name = (brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base}${base ? ", " : ""}${brand}` : base)
    .slice(0, MAX_NAME);
  const unit = String(p.product_quantity_unit || "g").toLowerCase();
  const amount = Number(p.product_quantity);
  const packGrams = amount > 0 && (unit === "g" || unit === "ml") ? round1(amount) : null;
  const n = p.nutriments || {};
  const per100 = {};
  for (const [field, [key, max]] of Object.entries(NUTRIMENTS)) {
    let v = n[key];
    if (field === "kcal" && !okNumber(v) && okNumber(n["energy-kj_100g"])) v = n["energy-kj_100g"] / KJ_PER_KCAL;
    if (okNumber(v) && v <= max) per100[field] = round1(v);
  }
  return { name, packGrams, packFromMl: packGrams != null && unit === "ml", eggs: eggCount(p.quantity),
    quantity: String(p.quantity || "").trim() || null, per_100g: per100 };
}

// One lookup. Throws LookupError with a message for the user; returns null when OFF does not have the barcode.
export async function lookupBarcode(barcode, { fetch: f = globalThis.fetch, now = Date.now } = {}) {
  const code = String(barcode || "").trim();
  if (!/^\d{8,14}$/.test(code)) throw new LookupError("A barcode has 8 to 14 digits.");
  if (busy) throw new LookupError("A lookup is already running.");
  const t = now();
  while (recent.length && t - recent[0] > 60000) recent.shift();
  if (recent.length >= PER_MINUTE) throw new LookupError("Too many lookups in a minute. Wait a moment and try again.");
  recent.push(t);
  busy = true;
  let res;
  try {
    res = await f(`${OFF_PRODUCT_URL}${code}.json?fields=${FIELDS}`, { headers: { "X-User-Agent": "SmartBite" } });
  } catch {
    throw new LookupError("Could not reach Open Food Facts. Check your connection, or fill the fields by hand.");
  } finally {
    busy = false;
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 503) throw new LookupError("Open Food Facts is busy. Try again in a minute.");
  if (!res.ok) throw new LookupError(`Open Food Facts answered ${res.status}. Fill the fields by hand.`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new LookupError("Open Food Facts sent something unreadable. Fill the fields by hand.");
  }
  return parseProduct(data);
}

// Tests only: forget the lookups counted in the last minute
export function resetLookups() {
  recent.length = 0;
  busy = false;
}
