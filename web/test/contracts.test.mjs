// The JS contract subset (lib/contracts.js): same schemas as docs/contracts, same verdicts as
// smartbite_engine/contracts.py on the cases of tests/test_contracts.py.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SCHEMAS, parseReply, validateOutput } from "../lib/contracts.js";

const CONTRACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "contracts");
const MACROS = { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 };
const idea = (n = "1", extra = {}) => ({ idea_id: n, name: "Greek chicken bowl", one_line: "Chicken, rice, cucumber and a yogurt sauce.",
  main_ingredients: ["chicken breast", "rice", "cucumber"], rough_macros: MACROS, image_prompt: "overhead photo of a chicken rice bowl", ...extra });
const recipe = (extra = {}) => ({ idea_id: "1", title: "Greek chicken bowl", servings: 4, prep_time_min: 40,
  ingredients: [{ name: "chicken breast", grams_per_serving: 170, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
    { name: "rice", grams_per_serving: 70, units_per_serving: 0, storage: "keeps", pantry: false, dry: true, note: "dry weight" }],
  steps: ["Cook the rice.", "Grill the chicken."], ...extra });

// Drop the keys the validator ignores, so the copy can be compared with the contract file. Inside "properties" the
// keys are field names (a field may be called "title"), so nothing is dropped there.
function strip(node, inProperties = false) {
  if (Array.isArray(node)) return node.map((v) => strip(v));
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([k]) => inProperties || !["description", "default", "$schema", "$id", "title"].includes(k))
    .map(([k, v]) => [k, strip(v, !inProperties && k === "properties")]));
}

test("the JS schemas are the same as docs/contracts", () => {
  for (const [file, doc] of Object.entries(SCHEMAS)) {
    const source = strip(JSON.parse(fs.readFileSync(path.join(CONTRACTS, file), "utf8")));
    for (const [name, def] of Object.entries(doc.$defs)) assert.deepEqual(def, source.$defs[name], `${file} ${name}`);
  }
});

test("ideas: 4 valid ideas pass, 3 fail, long names and wrong macros fail", () => {
  const four = [1, 2, 3, 4].map((n) => idea(String(n)));
  assert.deepEqual(validateOutput({ ideas: four }, "idea.schema.json"), []);
  assert.ok(validateOutput({ ideas: four.slice(0, 3) }, "idea.schema.json").some((e) => e.includes("at least 4 items")));
  assert.ok(validateOutput({ ideas: [idea("1", { name: "x".repeat(61) }), ...four.slice(1)] }, "idea.schema.json")
    .some((e) => e.includes("at most 60 characters")));
  const bad = idea("1", { rough_macros: { kcal: 450, protein_g: "lots", carbs_g: 1, fat_g: 1 } });
  assert.ok(validateOutput({ ideas: [bad, ...four.slice(1)] }, "idea.schema.json").some((e) => e.includes("ideas[0].rough_macros.protein_g: must be number")));
  assert.ok(validateOutput({ ideas: [idea("1", { price: 3 }), ...four.slice(1)] }, "idea.schema.json").some((e) => e.includes("unexpected field price")));
});

test("revision and recipe", () => {
  assert.deepEqual(validateOutput({ idea: idea() }, "revision.schema.json"), []);
  assert.deepEqual(validateOutput({ idea: idea("1", { changes: "no rice, more cucumber" }) }, "revision.schema.json"), []);
  assert.deepEqual(validateOutput(recipe(), "recipe.schema.json"), []);
  const r = recipe();
  delete r.ingredients[0].storage;
  r.ingredients[1].grams_per_serving = 0;
  const errors = validateOutput(r, "recipe.schema.json");
  assert.ok(errors.some((e) => e.includes("ingredients[0]: missing required field storage")));
  assert.ok(errors.some((e) => e.includes("ingredients[1].grams_per_serving: must be > 0")));
  assert.ok(validateOutput(recipe({ servings: 9 }), "recipe.schema.json").some((e) => e.includes("must be <= 8")));
  assert.ok(validateOutput(recipe({ servings: 2.5 }), "recipe.schema.json").some((e) => e.includes("must be integer")));
  // An optional short note on the recipe; no other extra field
  assert.deepEqual(validateOutput(recipe({ note: "Chickpeas from a jar, drained." }), "recipe.schema.json"), []);
  assert.ok(validateOutput(recipe({ note: "x".repeat(201) }), "recipe.schema.json").some((e) => e.includes("at most 200 characters")));
  assert.ok(validateOutput(recipe({ tips: "none" }), "recipe.schema.json").some((e) => e.includes("unexpected field tips")));
});

test("parseReply: fence ok, text after the JSON and broken JSON fail", () => {
  assert.deepEqual(parseReply('```json\n{"a": 1}\n```'), [{ a: 1 }, []]);
  const [d1, e1] = parseReply('{"a": 1}\nHere are your ideas!');
  assert.equal(d1, null);
  assert.match(e1[0], /extra text after the JSON/);
  const [d2, e2] = parseReply('{"a": ');
  assert.equal(d2, null);
  assert.match(e2[0], /not valid JSON/);
  assert.deepEqual(parseReply('  {"a": "} ] {"}  '), [{ a: "} ] {" }, []]);
});

test("import: whole-recipe grams, servings null or a number, pieces optional", () => {
  const ing = { line: "4 patatas grandes", name: "potato", grams_total: 800, units_total: 0, guessed: false, storage: "keeps",
    pantry: false, dry: false, pieces: { count: 4, size: "large" } };
  const reply = { title: "Huevos a la flamenca", servings: null, prep_time_min: 20, ingredients: [ing], steps: [] };
  assert.deepEqual(validateOutput(reply, "import.schema.json"), []);
  assert.deepEqual(validateOutput({ ...reply, servings: 4 }, "import.schema.json"), []);
  assert.ok(validateOutput({ ...reply, servings: "4" }, "import.schema.json").some((e) => e.includes("must be integer or null")));
  const bad = { ...ing, pieces: { count: 4, size: "huge" } };
  assert.ok(validateOutput({ ...reply, ingredients: [bad] }, "import.schema.json").some((e) => e.includes("pieces.size")));
});
