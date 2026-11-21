import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ALIASES, DEFAULT_PROFILE } from "../generated/index.js";
import { foodName, setVariant, translate } from "../lib/i18n.js";
import { ES, ES_PARTS } from "../lib/i18n/es.js";
import { FOODS_ES } from "../lib/i18n/foods-es.js";
import { ES_MX, FOODS_ES_MX } from "../lib/i18n/foods-es-MX.js";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "lib"];

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(p);
    }
  };
  DIRS.forEach((d) => walk(path.join(WEB, d)));
  // lib/i18n.js only shows examples in its comments; the dictionaries are what is checked
  return out.filter((p) => !p.includes(`${path.sep}lib${path.sep}i18n${path.sep}`) && !p.endsWith(`${path.sep}i18n.js`));
}
const files = sources().map((p) => ({ p: path.relative(WEB, p), text: fs.readFileSync(p, "utf8") }));

// Every English text passed to t(), tr() or tx() as a literal: "..." (escapes decoded)
function calls() {
  const found = new Map();
  for (const { p, text } of files) {
    for (const m of text.matchAll(/(?<![\w.])(?:t|tr|tx)\(\s*"((?:[^"\\\n]|\\.)*)"/g)) {
      const key = JSON.parse(`"${m[1]}"`);
      if (!found.has(key)) found.set(key, p);
    }
  }
  return found;
}

// Every string literal in the code, to tell a dictionary key that no code uses any more
function literals() {
  const all = new Set();
  for (const { text } of files) {
    for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      try { all.add(JSON.parse(`"${m[1]}"`)); } catch {}
    }
    for (const m of text.matchAll(/`([^`$]*)`/g)) all.add(m[1]);
  }
  // Kitchen Profile labels and help come from prompts/kitchen-profile.default.json (shown with t(field.label))
  const walk = (v) => (typeof v === "string" ? all.add(v) : v && typeof v === "object" && Object.values(v).forEach(walk));
  walk(DEFAULT_PROFILE);
  return all;
}

const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("i18n: every text the code translates has a Spanish entry", () => {
  const missing = [...calls()].filter(([key]) => !Object.hasOwn(ES, key)).map(([key, p]) => `${p}: ${key}`);
  assert.deepEqual(missing, [], `no Spanish text for:\n${missing.join("\n")}`);
});

test("i18n: no Spanish entry is left over from a text the code no longer has", () => {
  const all = literals();
  const unused = Object.keys(ES).filter((key) => !all.has(key));
  assert.deepEqual(unused, [], `Spanish entries no code uses:\n${unused.join("\n")}`);
});

test("i18n: English and Spanish have the same placeholders, no empty text, no dashes as connectors", () => {
  for (const [en, es] of Object.entries(ES)) {
    assert.ok(typeof es === "string" && es.trim(), `empty Spanish text for "${en}"`);
    assert.deepEqual(holes(es), holes(en), `placeholders differ: "${en}" -> "${es}"`);
    assert.ok(!/[—–]/.test(es), `dash in "${es}"`);
    assert.ok(!/[—–]/.test(en), `dash in "${en}"`);
  }
});

test("i18n: a text in two dictionaries has the same Spanish", () => {
  const seen = {};
  for (const [part, dict] of Object.entries(ES_PARTS)) {
    for (const [en, es] of Object.entries(dict)) {
      if (en in seen) assert.equal(es, seen[en].es, `"${en}": ${seen[en].part} and ${part} differ`);
      else seen[en] = { part, es };
    }
  }
});

test("i18n: translate fills placeholders and falls back to English", () => {
  assert.equal(translate("Added \"{name}\" to cart!", { name: "Tuna salad" }, "en"), "Added \"Tuna salad\" to cart!");
  assert.equal(translate("Added \"{name}\" to cart!", { name: "Tuna salad" }, "es"), "¡\"Tuna salad\" añadido al carrito!");
  assert.equal(translate("A text with no entry", null, "es"), "A text with no entry");
});

test("food names: every known food (foods and more_foods) has a Spanish name, and only known foods do", () => {
  const foods = [...ALIASES.foods, ...(ALIASES.more_foods || [])]; // the prompt's foods and the names-only foods
  assert.equal(foods.length, new Set(foods).size);
  const missing = foods.filter((f) => !FOODS_ES[f]?.trim());
  assert.deepEqual(missing, [], `no Spanish name for: ${missing.join(", ")}`);
  const extra = Object.keys(FOODS_ES).filter((f) => !foods.includes(f));
  assert.deepEqual(extra, [], `Spanish names for foods not in aliases.json: ${extra.join(", ")}`);
  for (const es of Object.values(FOODS_ES)) {
    assert.equal(es, es.toLowerCase().replace("bruselas", "Bruselas"), `lowercase like the English keys: ${es}`);
    assert.ok(!/[—–]/.test(es), `dash in ${es}`);
  }
});

test("food names: foodName shows the Spanish name of a known food and leaves anything else as given", () => {
  assert.equal(foodName("frozen peas", "es"), "guisantes congelados");
  assert.equal(foodName("frozen peas", "en"), "frozen peas");
  assert.equal(foodName("Chicken breast", "es"), "Pechuga de pollo"); // capital kept
  assert.equal(foodName("canned tuna in water", "es"), "atún al natural (lata)");
  assert.equal(foodName("guisantes", "es"), "guisantes congelados"); // a Spanish alias resolves to its food
  // Product names and unknown foods stay exactly as typed or imported
  assert.equal(foodName("Hacendado Atún claro en aceite de oliva 3x80 g", "es"), "Hacendado Atún claro en aceite de oliva 3x80 g");
  assert.equal(foodName("dragon fruit", "es"), "dragon fruit");
  assert.equal(foodName("", "es"), "");
});

test("food names: a name only a word rule matched is not that food, so it shows as written", () => {
  assert.equal(foodName("pork chops", "es"), "pork chops"); // the engine counts it as pork loin; the name stays
  assert.equal(foodName("honey", "es"), "miel"); // more_foods have Spanish names too
  assert.equal(foodName("peach", "es"), "melocotón");
});

test("Mexico: every Mexican name has a Spain name to replace, and shows only when the country is MX", () => {
  const noSpain = Object.keys(FOODS_ES_MX).filter((k) => !FOODS_ES[k]);
  assert.deepEqual(noSpain, [], `Mexican food names with no Spain name: ${noSpain.join(", ")}`);
  const noText = Object.keys(ES_MX).filter((k) => !Object.hasOwn(ES, k));
  assert.deepEqual(noText, [], `Mexican texts with no Spain text: ${noText.join(", ")}`);
  for (const [en, mx] of Object.entries(ES_MX)) {
    assert.deepEqual(holes(mx), holes(en), `placeholders differ: "${en}" -> "${mx}"`);
    assert.ok(!/[—–]/.test(mx), `dash in "${mx}"`);
  }
  for (const mx of Object.values(FOODS_ES_MX)) assert.equal(mx, mx.toLowerCase(), `lowercase like the English keys: ${mx}`);
  assert.equal(foodName("frozen peas", "es", "MX"), "chícharos congelados");
  assert.equal(foodName("Potato", "es", "MX"), "Papa");
  assert.equal(foodName("frozen peas", "es", null), "guisantes congelados");
  assert.equal(foodName("frozen peas", "en", "MX"), "frozen peas");
  try {
    setVariant("MX");
    assert.equal(translate("Stove", null, "es"), "Estufa");
    assert.equal(translate("Stove", null, "en"), "Stove");
    assert.equal(foodName("green beans", "es"), "ejotes");
    setVariant("ES");
    assert.equal(translate("Stove", null, "es"), "Fogones");
  } finally {
    setVariant(null);
  }
});
