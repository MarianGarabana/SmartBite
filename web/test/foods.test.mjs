// My Day food picker (lib/foods.js, 2026-11-21): search the nutrition table by English or Spanish names (accents,
// plurals, partial words), the user's labelled products first on a tie, and the macros for an amount, the same as
// the engine (smartbite_engine/calc.py scale; eggs by size; a label's missing fiber from the food's table record,
// like smartbite_engine/meal.py _label_macros). Inline table and names, plus a few checks on the real data.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// lib/*.js import each other without ".js" (Next.js resolves that); add it for node
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (specifier.startsWith(".") && !specifier.endsWith(".js")) return next(specifier + ".js", context);
    throw e;
  }
}`));

const foods = await import("../lib/foods.js");
const day = await import("../lib/day.js");

// [kcal, protein_g, carbs_g, fat_g, fiber_g or null] per 100 g, as generated/food-table.js
const TABLE = {
  banana: [87.6, 1.06, 19.7, 0, 2.7],
  "cherry tomatoes": [20, 0.8, 2.8, 0.3, 1.3],
  "chicken breast": [110, 23.4, 0, 1.5, null],
  eggs: [140, 12.8, 0.06, 9.83, 0],
  "egg whites": [48, 10.7, 0.7, 0.2, null],
  "frozen peas": [77.9, 5.86, 9.5, 0.4, 6.45],
  mushrooms: [27, 3.1, 0.5, 0.3, 1.5],
  "rolled oats": [379, 13.15, 57.6, 6.52, 10.1],
};
const NAMES = {
  foods: Object.keys(TABLE).concat(["frozen salmon"]),
  aliases: {
    platano: "banana", "tomate cherry": "cherry tomatoes", "pechuga de pollo": "chicken breast", huevos: "eggs",
    "claras de huevo": "egg whites", guisantes: "frozen peas", "guisantes congelados": "frozen peas",
    champinones: "mushrooms", "copos de avena": "rolled oats", "salmon congelado": "frozen salmon",
  },
};
const find = (q, opts = {}) => foods.searchFoods(q, { table: TABLE, aliases: NAMES, ...opts });
const names = (list) => list.map((r) => r.name);

test("search: English names, partial words and plurals", () => {
  assert.deepEqual(names(find("banana")), ["banana"]);
  assert.deepEqual(names(find("bananas")), ["banana"]);
  assert.deepEqual(names(find("chicken b")), ["chicken breast"]);
  assert.deepEqual(names(find("tomatoes")), ["cherry tomatoes"]);
  assert.deepEqual(names(find("oat")), ["rolled oats"]);
  assert.equal(find("banana")[0].alt, null); // the shown name matched
  assert.deepEqual(find("zzz"), []);
});

test("search: Spanish names find the English food and say which name matched", () => {
  const peas = find("guisantes");
  assert.deepEqual(names(peas), ["frozen peas"]);
  assert.equal(peas[0].alt, "guisantes");
  assert.deepEqual(names(find("guisante")), ["frozen peas"]); // singular
  assert.deepEqual(names(find("pollo")), ["chicken breast"]); // a word inside the name
  assert.deepEqual(names(find("avena")), ["rolled oats"]);
});

test("search: accents and capitals do not matter", () => {
  assert.deepEqual(names(find("Plátano")), ["banana"]);
  assert.deepEqual(names(find("CHAMPIÑONES")), ["mushrooms"]);
  assert.deepEqual(names(find("champiñón")), ["mushrooms"]);
});

test("search: the exact food first, then names that start with the search, then word matches, A to Z", () => {
  assert.deepEqual(names(find("huevos")), ["eggs", "egg whites"]); // "claras de huevo" is a word match
  assert.deepEqual(names(find("egg")), ["eggs", "egg whites"]);
  assert.deepEqual(names(find("eggs")), ["eggs", "egg whites"]);
});

test("search: a food with no nutrition record is never listed", () => {
  assert.deepEqual(find("salmon congelado"), []);
  assert.deepEqual(find("frozen"), find("frozen").filter((r) => r.food !== "frozen salmon"));
});

test("search: an empty search lists the products, then every food A to Z; no table lists nothing", () => {
  const all = find("  ");
  assert.deepEqual(names(all), Object.keys(TABLE).sort());
  assert.deepEqual(foods.searchFoods("banana", { table: null }), []);
  const products = { "rolled oats": { food: "rolled oats", name: "Copos de avena integral", sold_by: "pack", pack_grams: 500,
    per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 } } };
  assert.equal(find("", { products })[0].kind, "product");
});

test("search: the user's labelled products come first on a tie; products without a label are left out", () => {
  const products = {
    "rolled oats": { food: "rolled oats", name: "Copos de avena integral", sold_by: "pack", pack_grams: 500,
      per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 } },
    banana: { food: "banana", name: "Platano de Canarias", sold_by: "per_kg", pack_grams: 1000, price_eur: 2.5 },
    "my bars": { food: "my bars", name: "Protein bar", sold_by: "pack", pack_grams: 60,
      per_100g: { kcal: 350, protein_g: 33, carbs_g: 30, fat_g: 10, fiber_g: 8 } },
  };
  const oats = find("avena", { products });
  assert.deepEqual(oats.map((r) => [r.kind, r.name]), [["product", "Copos de avena integral"], ["food", "rolled oats"]]);
  assert.deepEqual(names(find("platano", { products })), ["banana"]); // no label: only the table food
  const bar = find("protein bar", { products });
  assert.deepEqual(bar.map((r) => [r.kind, r.food]), [["product", "my bars"]]); // a food the table does not know
  assert.equal(bar[0].per100.fiber_g, 8);
});

test("label values win; a value the label lacks (fiber) comes from the food's table record", () => {
  const oats = { food: "rolled oats", per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 } };
  const { kcal, protein_g, carbs_g, fat_g, fiber_g } = foods.labelPer100(oats, TABLE, NAMES);
  assert.deepEqual({ kcal, protein_g, carbs_g, fat_g, fiber_g }, { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7, fiber_g: 10.1 });
  assert.equal(foods.labelPer100({ ...oats, per_100g: { ...oats.per_100g, fiber_g: 9 } }, TABLE, NAMES).fiber_g, 9);
  assert.equal(foods.labelPer100({ ...oats, food: "copos de avena" }, TABLE, NAMES).fiber_g, 10.1); // by any name
  assert.equal(foods.labelPer100({ ...oats, food: "my bars" }, TABLE, NAMES).fiber_g, null); // unknown food: no fiber
  // 60 g of the label: the numbers the engine gives (meal.py _label_macros), 223.2 kcal and 6.06 g fiber
  assert.deepEqual(foods.macrosFor(foods.labelPer100(oats, TABLE, NAMES), 60),
    { kcal: 223.2, protein_g: 8.1, carbs_g: 35.22, fat_g: 4.2, fiber_g: 6.06 });
});

test("macros: value per 100 g x grams / 100, the engine's numbers; no fiber data stays null", () => {
  const peas = foods.findFood("frozen peas", TABLE, NAMES);
  // smartbite_engine ingredient_macros("frozen peas", 150): 116.85000000000001, 8.790000000000001, 14.25, 0.6..., 9.675
  assert.deepEqual(foods.macrosFor(peas, 150),
    { kcal: 116.85000000000001, protein_g: 8.790000000000001, carbs_g: 14.25, fat_g: 0.6000000000000001, fiber_g: 9.675 });
  assert.deepEqual(foods.roundFood(foods.macrosFor(peas, 150)), { kcal: 117, protein_g: 8.8, carbs_g: 14.3, fat_g: 0.6, fiber_g: 9.7 });
  assert.equal(foods.macrosFor(foods.findFood("chicken breast", TABLE, NAMES), 200).fiber_g, null);
  assert.equal(foods.findFood("guisantes", TABLE, NAMES).kcal, 77.9); // found by any name, like the engine's find
  assert.equal(foods.findFood("nothing", TABLE, NAMES), null);
});

test("eggs: counted in whole eggs, edible grams by size S 42, M 51, L 60, XL 69, M by default", () => {
  assert.deepEqual(foods.EGG_GRAMS, { S: 42, M: 51, L: 60, XL: 69 });
  assert.equal(foods.gramsOf(2, true), 102);
  assert.equal(foods.gramsOf(2, true, "S"), 84);
  assert.equal(foods.gramsOf(3, true, "XL"), 207);
  assert.equal(foods.gramsOf(150, false, "XL"), 150);
  const eggs = foods.searchFoods("huevos", { table: TABLE, aliases: NAMES })[0];
  assert.equal(eggs.eggs, true);
  // smartbite_engine ingredient_macros("eggs", 102): 142.8 kcal, 13.056 g protein
  const two = foods.foodItem(eggs, foods.gramsOf(2, true), "2 eggs, size M");
  assert.deepEqual(two, { name: "eggs (2 eggs, size M)", kcal: 143, protein_g: 13.1, carbs_g: 0.1, fat_g: 10, fiber_g: 0, source: "food" });
  assert.deepEqual(foods.readAmount("2", true), { ok: true, value: 2 });
  assert.deepEqual(foods.readAmount("1.5", true), { ok: false, error: "eggs" });
  assert.deepEqual(foods.readAmount("13", true), { ok: false, error: "eggs" });
});

test("readAmount: grams above 0 and up to 2000, a comma works; empty is its own error", () => {
  assert.deepEqual(foods.readAmount("150"), { ok: true, value: 150 });
  assert.deepEqual(foods.readAmount(" 37,5 "), { ok: true, value: 37.5 });
  assert.deepEqual(foods.readAmount(""), { ok: false, error: "empty" });
  assert.deepEqual(foods.readAmount("0"), { ok: false, error: "grams" });
  assert.deepEqual(foods.readAmount("-5"), { ok: false, error: "grams" });
  assert.deepEqual(foods.readAmount("2001"), { ok: false, error: "grams" });
  assert.deepEqual(foods.readAmount("abc"), { ok: false, error: "grams" });
});

test("the day item: name with the amount within 60 characters, fiber only when known, kept by lib/day.js", () => {
  const [peas] = find("guisantes");
  const item = foods.foodItem({ ...peas, name: "Frozen peas" }, 150, "150 g");
  assert.deepEqual(item, { name: "Frozen peas (150 g)", kcal: 117, protein_g: 8.8, carbs_g: 14.3, fat_g: 0.6, fiber_g: 9.7, source: "food" });
  const [chicken] = find("chicken breast");
  assert.equal("fiber_g" in foods.foodItem(chicken, 100, "100 g"), false);
  const long = foods.itemName("x".repeat(80), "150 g");
  assert.equal(long.length, 60);
  assert.ok(long.endsWith(" (150 g)"));
  const products = { "rolled oats": { food: "rolled oats", name: "Copos de avena", sold_by: "pack", pack_grams: 500,
    per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 } } };
  assert.equal(foods.foodItem(find("avena", { products })[0], 60, "60 g").source, "label");

  // lib/day.js keeps fiber and source, adds fiber to the day, and still lists the food as having no vitamin data
  let d = day.addExtra(day.emptyDay(), "lunch", item);
  d = day.addExtra(d, "snack", { name: "Banana", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 });
  assert.deepEqual(d.slots.lunch[0], { id: "i1", kind: "extra", ...item });
  assert.deepEqual(day.normalizeDay(JSON.parse(JSON.stringify(d))), d);
  assert.equal(day.normalizeDay({ slots: { lunch: [{ ...item, kind: "extra", source: "bad", fiber_g: -1 }] } }).slots.lunch[0].source, undefined);
  const resolved = day.resolveDay(d, []);
  assert.deepEqual(resolved.totals, { kcal: 222, protein_g: 10.1, carbs_g: 41.3, fat_g: 1 });
  const micros = day.microsToday(resolved.rows);
  assert.deepEqual(micros.fiber, { grams: 10, pct: 39 });
  assert.deepEqual(micros.notCounted, ["Frozen peas (150 g)", "Banana"]);
});

test("real data: every food in the nutrition table loads, with Spanish names from aliases.json", async () => {
  const table = await foods.loadFoodTable();
  const { FOOD_FIELDS } = await import("../generated/food-table.js");
  assert.deepEqual(FOOD_FIELDS, foods.FIELDS); // the columns lib/foods.js reads
  const source = JSON.parse(fs.readFileSync(new URL("../../data/open/nutrition/per-100g.json", import.meta.url), "utf8")).foods;
  assert.deepEqual(Object.keys(table).sort(), Object.keys(source).sort());
  for (const [food, r] of Object.entries(source)) {
    assert.deepEqual(table[food], foods.FIELDS.map((k) => r[k] ?? null), food); // a missing micro is null, never 0
  }
  const peas = foods.searchFoods("guisantes", { table });
  assert.equal(peas[0].food, "frozen peas");
  assert.equal(foods.searchFoods("huevos", { table })[0].food, "eggs");
  assert.equal(foods.searchFoods("platano", { table })[0].food, "banana");
  assert.equal(foods.searchFoods("", { table }).length, Object.keys(source).length);
});

// Peas with all 10 micros, a food with only some (the rest unknown), per 100 g in FIELDS order
const MICRO_TABLE = {
  "frozen peas": [77.9, 5.86, 9.5, 0.4, 6.45, 1.5, 25, 200, 30, 1, 40, 20, 0, 0, 60],
  "rolled oats": [379, 13.15, 57.6, 6.52, 10.1, 4, 50, null, 130, null, null, null, null, null, 30],
};

test("micros: scaled by grams like the engine, only the ones the food has; the label's value wins", () => {
  assert.deepEqual(foods.FIELDS.slice(5), day.MICROS.map(([k]) => k));
  const peas = foods.findFood("frozen peas", MICRO_TABLE, NAMES);
  assert.deepEqual(foods.microsFor(peas, 150), { iron_mg: 2.25, calcium_mg: 37.5, potassium_mg: 300, magnesium_mg: 45, zinc_mg: 1.5,
    vitamin_a_ug: 60, vitamin_c_mg: 30, vitamin_d_ug: 0, vitamin_b12_ug: 0, folate_ug: 90 });
  const oats = foods.findFood("rolled oats", MICRO_TABLE, NAMES);
  assert.deepEqual(foods.microsFor(oats, 50), { iron_mg: 2, calcium_mg: 25, magnesium_mg: 65, folate_ug: 15 }); // unknown stays out
  const product = { food: "rolled oats", name: "Copos", per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7, iron_mg: 3.6 } };
  const label = foods.labelPer100(product, MICRO_TABLE, NAMES);
  assert.equal(label.iron_mg, 3.6); // on the label
  assert.equal(label.calcium_mg, 50); // from the table
  assert.equal(label.zinc_mg, null); // nowhere: unknown
  assert.equal(foods.labelPer100({ ...product, food: "my bars" }, MICRO_TABLE, NAMES).iron_mg, 3.6);
  assert.equal(foods.labelPer100({ ...product, food: "my bars" }, MICRO_TABLE, NAMES).calcium_mg, null);
});

test("micros in the day: % of the daily value added up with recipes; a missing value marks the row partial", () => {
  const [peas] = foods.searchFoods("guisantes", { table: MICRO_TABLE, aliases: NAMES });
  const [oats] = foods.searchFoods("rolled oats", { table: MICRO_TABLE, aliases: NAMES });
  const pItem = foods.foodItem({ ...peas, name: "Frozen peas" }, 150, "150 g");
  assert.deepEqual(pItem.micros, foods.microsFor(peas.per100, 150));
  let d = day.addExtra(day.emptyDay(), "lunch", pItem);
  assert.deepEqual(day.normalizeDay(JSON.parse(JSON.stringify(d))), d); // kept on reload
  let m = day.microsToday(day.resolveDay(d, []).rows);
  assert.deepEqual(m.notCounted, []);
  assert.deepEqual(m.nutrients.map((n) => [n.key, n.pct, n.partial]), [["iron_mg", 16, false], ["calcium_mg", 5, false],
    ["potassium_mg", 15, false], ["magnesium_mg", 12, false], ["zinc_mg", 15, false], ["vitamin_a_ug", 8, false],
    ["vitamin_c_mg", 38, false], ["vitamin_d_ug", 0, false], ["vitamin_b12_ug", 0, false], ["folate_ug", 45, false]]);

  // Oats have no potassium value: that row becomes partial; a recipe's whole % per serving adds in
  d = day.addExtra(d, "breakfast", foods.foodItem(oats, 50, "50 g"));
  d = day.addRecipe(d, "dinner", "bowl", 1);
  const BOWL = { slug: "bowl", name: "Chicken bowl", categories: ["Dinner"], category: "Dinner",
    perServing: { kcal: 500, protein_g: 45, carbs_g: 40, fat_g: 15 }, ingredients: [], fiberG: 5,
    micros: { rows: [{ key: "iron_mg", label: "Iron", amount: "3 mg", pct: 25, bar: 25, partial: false }] } };
  d = day.addExtra(d, "snack", { name: "Banana", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 });
  m = day.microsToday(day.resolveDay(d, [BOWL]).rows);
  const row = (k) => m.nutrients.find((n) => n.key === k);
  assert.deepEqual(row("iron_mg"), { key: "iron_mg", label: "Iron", pct: 55, bar: 55, partial: false }); // 16.07 + 14.29 + 25
  assert.equal(row("potassium_mg").partial, true);
  assert.equal(row("potassium_mg").pct, 15);
  assert.deepEqual(m.notCounted, ["Banana"]); // typed by hand: no vitamin data
  assert.equal(day.normalizeDay({ slots: { lunch: [{ name: "x", kcal: 1, kind: "extra", micros: { iron_mg: -1, junk: 3 } }] } })
    .slots.lunch[0].micros, undefined);
});

// Parity with the Python engine (ingredient_macros, _label_macros, scale_micros, micros_block) on the real table
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");
test("parity: the same macros, micros and % daily value as smartbite_engine", { skip: !fs.existsSync(PYTHON) && "no .venv/bin/python" }, async () => {
  const table = await foods.loadFoodTable();
  const OATS = { food: "rolled oats", name: "Copos de avena", sold_by: "pack", pack_grams: 500,
    per_100g: { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 } };
  const CASES = [{ food: "frozen peas", grams: 150 }, { food: "eggs", grams: foods.gramsOf(2, true) },
    { food: "banana", grams: 120 }, { food: "chicken breast", grams: 137.5 }, { food: "eggs", grams: foods.gramsOf(3, true, "XL") },
    { food: "rolled oats", grams: 60, product: OATS },
    { food: "rolled oats", grams: 45, product: { ...OATS, per_100g: { ...OATS.per_100g, fiber_g: 9, iron_mg: 3.6 } } }];
  const py = "import json,sys\nfrom smartbite_engine.nutrition import load_table, ingredient_macros, micros_block\n" +
    "from smartbite_engine.meal import _label_macros\nt=load_table()\nout=[]\nfor c in json.load(sys.stdin):\n" +
    "  m=_label_macros(c['food'],c['grams'],c['product'],t) if c.get('product') else ingredient_macros(c['food'],c['grams'],table=t)\n" +
    "  b=micros_block([{'name':c['food'],'grams':c['grams'],'micros':m.micros}],1)\n" +
    "  out.append({'amount':list(m.amount),'micros':m.micros,'pct':{n['key']:n['pct'] for n in b['nutrients']}})\n" +
    "print(json.dumps(out))";
  const run = spawnSync(PYTHON, ["-c", py], { cwd: ROOT, input: JSON.stringify(CASES), encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  const want = JSON.parse(run.stdout);
  CASES.forEach((c, i) => {
    const p100 = c.product ? foods.labelPer100(c.product, table) : foods.findFood(c.food, table);
    const m = foods.macrosFor(p100, c.grams);
    assert.deepEqual([m.kcal, m.protein_g, m.carbs_g, m.fat_g, m.fiber_g ?? 0], want[i].amount, `${c.food} macros`);
    assert.deepEqual(foods.microsFor(p100, c.grams), want[i].micros, `${c.food} micros`);
    const item = foods.foodItem({ kind: c.product ? "product" : "food", name: c.food, per100: p100 }, c.grams, `${c.grams} g`);
    const got = day.microsToday(day.resolveDay(day.addExtra(day.emptyDay(), "lunch", item), []).rows);
    assert.deepEqual(Object.fromEntries(got.nutrients.map((n) => [n.key, n.pct])), want[i].pct, `${c.food} % daily value`);
  });
});
