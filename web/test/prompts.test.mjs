// Prompt rendering: the JS port (lib/prompts.js) must give the same text as smartbite_engine/prompts.py.
// The parity cases run the Python engine from the repo's .venv; they are skipped when it is not there.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateIdeas, reviseIdea, writeRecipe } from "../lib/llm.js";
import { defaultProfile, fill, formText, gramLimits, ideaPrompt, importPrompt, loadTemplate, pyDumps, pyFixed, pyG, recipePrompt,
  renderProfile, rerunInfo, revisionPrompt, targetRanges, typicalPackHints } from "../lib/prompts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");

const FORM = { craving: "Greek chicken bowl", servings: 4, budget_total_eur: 20, kcal_target: 450, protein_g_target: 45,
  keep_leftovers_low: true, exclude: ["feta"], gear: ["oven", "no_blender"], reheat_at_work: true, fat_g_max: 15 };
const IDEA = { idea_id: "2", name: "Greek chicken bowl", one_line: "Chicken, rice and cucumber.",
  main_ingredients: ["pechuga de pollo", "arroz", "pepino"], rough_macros: { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 },
  image_prompt: "a bowl", changes: "no tomato" };

// Case 1: default profile, idea and revision prompts with inspiration and known ingredients
const CASE_1 = {
  form: FORM, idea: IDEA, changes: "  more cucumber, no \"feta\"  ",
  inspiration: [{ name: "Shakshuka", cuisine: "Middle Eastern", style: "stew", core: ["huevos", "tomate"], method: "Poach eggs in tomato sauce." }],
  known: ["arroz", "pechuga de pollo"],
};

// Case 2: edited profile, a recipe rerun with pack hints and change requests, exact rounding ties and non-ASCII text
function case2() {
  const profile = defaultProfile();
  const fields = Object.fromEntries(profile.sections.flatMap((s) => s.fields.map((f) => [f.id, f])));
  fields.kcal_target.value = 600.5;
  fields.protein_g_target.value = 52;
  fields.gear.value = "Blender and air fryer.";
  fields.proteins.value = ["tofu", " eggs ", ""];
  fields.dressings.value = "";
  fields.who.value = "  Cook for two, jalapeño fans.  ";
  for (const s of profile.sections) if (s.id === "budget") for (const f of s.fields) f.value = "";
  return {
    profile,
    form: { craving: "lentejas con chorizo, sin cebolla", servings: 2, budget_total_eur: 10.25, kcal_target: 450.5,
      protein_g_target: 44.5, carbs_g_max: 60, fat_g_max: null, keep_leftovers_low: false, exclude: ["cebolla", "ajo"],
      gear: ["microwave_only"], reheat_at_work: false, time_limit_min: 45 },
    idea: { ...IDEA, idea_id: "3", name: "Lentejas estofadas", changes: "más pimentón" },
    known: ["lentejas", "chorizo"],
    packHints: [{ ingredient: "pechuga de pollo", pack_grams: 500, sold_by: "pack" },
      { ingredient: "patata", pack_grams: 1000, sold_by: "per_kg" }, { ingredient: "zanahoria", pack_grams: null, sold_by: "per_kg" },
      { ingredient: "huevos", units_per_pack: 12, sold_by: "per_unit" }, { ingredient: "atún", pack_grams: 52.5, sold_by: "pack" },
      "tomate: 1 kg"],
    // A rerun block with rounding ties (0.5 g, 12.5 g, 2.5 kcal), eggs in units and an unknown food
    rerun: { attempt: 3, max_attempts: 3,
      previous: { title: "Old lentejas", servings: 2, ingredients: [{ name: "lentejas", grams_per_serving: 80.5 }] },
      per_serving: { kcal: 498.25, protein_g: 33.25, carbs_g: 64.05, fat_g: 7.15 },
      lines: [{ name: "lentejas", grams: 80.5, kcal: 2.5, protein_g: 12.5, carbs_g: 40.5, fat_g: 0.5 },
        { name: "huevos", grams: 102, kcal: 146.88, protein_g: 12.6, carbs_g: 0.37, fat_g: 10.2 }],
      misses: ["kcal 498 vs target 450"], unresolved: ["chorizo casero"],
      change_requests: [{ from_agent: "macro", ingredient: null, reason: "misses_macros", hint: "add 10 g protein" },
        { from_agent: "pack", ingredient: "patata", reason: "high_leftover", hint: "" }],
      limits: [{ name: "lentejas", first_grams: 80.5, max_grams: 92 }, { name: "huevos", first_units: 2, max_units: 2.3 }] },
  };
}

function jsRender(c) {
  if (c.inspiration) {
    return {
      idea: ideaPrompt(c.form, { inspiration: c.inspiration, knownIngredients: c.known }),
      revision: revisionPrompt(c.form, c.idea, c.changes, { knownIngredients: c.known }),
      recipe: recipePrompt(c.form, c.idea, { knownIngredients: c.known }),
      profile: renderProfile(null),
      form: formText(c.form),
    };
  }
  return {
    idea: ideaPrompt(c.form, { profile: c.profile, knownIngredients: c.known }),
    revision: revisionPrompt(c.form, c.idea, "sin chorizo", { profile: c.profile }),
    recipe: recipePrompt(c.form, c.idea, { profile: c.profile, knownIngredients: c.known, packHints: c.packHints,
      rerun: c.rerun }),
    profile: renderProfile(c.profile),
    form: formText(c.form),
  };
}

const PY_RENDER = `
import json, sys
from smartbite_engine.prompts import form_text, idea_prompt, recipe_prompt, render_profile, revision_prompt
c = json.load(sys.stdin)
if "inspiration" in c:
    out = {"idea": idea_prompt(c["form"], inspiration=c["inspiration"], known_ingredients=c["known"]),
           "revision": revision_prompt(c["form"], c["idea"], c["changes"], known_ingredients=c["known"]),
           "recipe": recipe_prompt(c["form"], c["idea"], known_ingredients=c["known"]),
           "profile": render_profile(None), "form": form_text(c["form"])}
else:
    p = c["profile"]
    out = {"idea": idea_prompt(c["form"], profile=p, known_ingredients=c["known"]),
           "revision": revision_prompt(c["form"], c["idea"], "sin chorizo", profile=p),
           "recipe": recipe_prompt(c["form"], c["idea"], profile=p, known_ingredients=c["known"], pack_hints=c["packHints"],
                                   rerun=c["rerun"]),
           "profile": render_profile(p), "form": form_text(c["form"])}
print(json.dumps(out, ensure_ascii=False))
`;

function pyRender(c) {
  // Python reads 600.5 as a float and 52 as an int, like JSON.parse keeps them in JS
  const run = spawnSync(PYTHON, ["-c", PY_RENDER], { cwd: ROOT, input: JSON.stringify(c), encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

const hasPython = fs.existsSync(PYTHON);

for (const [name, make] of [["case 1: default profile, idea and revision", () => CASE_1], ["case 2: edited profile, recipe rerun", case2]]) {
  test(`same prompts as smartbite_engine/prompts.py, ${name}`, { skip: !hasPython && "no .venv/bin/python" }, () => {
    const c = make();
    const js = jsRender(c);
    const py = pyRender(c);
    for (const key of Object.keys(py)) assert.deepEqual(js[key], py[key], key);
  });
}

// Cases 3 and 4: the prompts lib/llm.js sends (fetch mocked) with the inputs it adds by itself: 12 dishes picked
// for the seed, the English food keys as known ingredients and the typical pack sizes as pack hints. Python builds
// the same inputs with pick_dishes, names.foods() and generic_packs.load_packs().
const LLM = { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-test-key-0000" };
const LLM_CASES = [
  { form: { craving: "lentejas con chorizo, sin cebolla", servings: 2, budget_total_eur: 10.25, kcal_target: 450,
    protein_g_target: 44.5, carbs_g_max: 60, fat_g_max: null, keep_leftovers_low: false, exclude: ["cebolla", "huevos"],
    gear: ["microwave_only"], reheat_at_work: false, time_limit_min: 45 }, seed: "req-3", profile: null },
  { form: FORM, seed: 7, profile: "case2" },
];
const LLM_IDEA = { idea_id: "1", name: "Bowl", one_line: "A bowl.", main_ingredients: ["chicken breast", "rice"],
  rough_macros: { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 }, image_prompt: "a bowl" };
// On a rerun the pack hints add the last recipe's bought foods (patatas -> potato), not its pantry oil
const RERUN_RECIPE = { idea_id: "1", title: "Bowl", servings: 2, prep_time_min: 30, steps: ["Cook."], ingredients: [
  { name: "pechuga de pollo", grams_per_serving: 150, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
  { name: "patatas", grams_per_serving: 200, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
  { name: "extra virgin olive oil", grams_per_serving: 5, units_per_serving: 0, storage: "keeps", pantry: true, dry: false }] };
const RERUN = { attempt: 2, max_attempts: 3, per_serving: { kcal: 520, protein_g: 40, carbs_g: 50, fat_g: 10 }, lines: [],
  misses: [], unresolved: [], change_requests: [], limits: [] };

async function llmPrompts(c) {
  const profile = c.profile === "case2" ? case2().profile : c.profile;
  const ideas = { ideas: ["1", "2", "3", "4"].map((id) => ({ ...LLM_IDEA, idea_id: id })) };
  const recipe = { idea_id: "1", title: "Bowl", servings: c.form.servings, prep_time_min: 30, steps: ["Cook."],
    ingredients: ["chicken breast", "rice"].map((name) => ({ name, grams_per_serving: 100, units_per_serving: 0,
      storage: "fresh", pantry: false, dry: name === "rice" })) };
  const replies = [ideas, { idea: LLM_IDEA }, recipe, recipe];
  const sent = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ system: body.system, user: body.messages[0].content });
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(replies[sent.length - 1]) }] }) };
  };
  try {
    await generateIdeas({ form: c.form, profile, llm: LLM, seed: c.seed });
    await reviseIdea({ idea: LLM_IDEA, changes: "more rice", form: c.form, profile, llm: LLM });
    await writeRecipe({ idea: LLM_IDEA, form: c.form, profile, llm: LLM });
    await writeRecipe({ idea: LLM_IDEA, form: c.form, profile, llm: LLM, rerun: { ...RERUN, previous: RERUN_RECIPE } });
  } finally {
    globalThis.fetch = saved;
  }
  return { idea: sent[0], revision: sent[1], recipe: sent[2], rerun: sent[3], profile };
}

const PY_LLM = `
import json, sys
from smartbite_engine.inspiration import pick_dishes
from smartbite_engine.names import foods
from smartbite_engine.prompts import idea_prompt, pack_hint_foods, pack_hints_for, recipe_prompt, revision_prompt
c = json.load(sys.stdin)
form, p, idea, known, rerun = c["form"], c["profile"], c["idea"], foods(), c["rerun"]
hints = pack_hints_for(pack_hint_foods(idea))
rerun_hints = pack_hints_for(pack_hint_foods(idea, rerun))
dishes = pick_dishes(form["craving"], form.get("exclude") or [], seed=c["seed"])
print(json.dumps({"idea": idea_prompt(form, profile=p, inspiration=dishes, known_ingredients=known),
                  "revision": revision_prompt(form, idea, "more rice", profile=p, known_ingredients=known),
                  "recipe": recipe_prompt(form, idea, profile=p, known_ingredients=known, pack_hints=hints),
                  "rerun": recipe_prompt(form, idea, profile=p, known_ingredients=known, pack_hints=rerun_hints, rerun=rerun),
                  "n_dishes": len(dishes), "n_known": len(known), "n_hints": len(hints),
                  "n_rerun_hints": len(rerun_hints)}, ensure_ascii=False))
`;

LLM_CASES.forEach((c, i) => {
  test(`llm.js sends the same prompts as smartbite_engine/prompts.py with dishes, known ingredients and pack hints, case ${i + 3}`,
    { skip: !hasPython && "no .venv/bin/python" }, async () => {
      const js = await llmPrompts(c);
      const run = spawnSync(PYTHON, ["-c", PY_LLM], { cwd: ROOT, encoding: "utf8",
        input: JSON.stringify({ form: c.form, profile: js.profile, idea: LLM_IDEA, seed: c.seed,
          rerun: { ...RERUN, previous: RERUN_RECIPE } }) });
      assert.equal(run.status, 0, run.stderr);
      const py = JSON.parse(run.stdout);
      assert.deepEqual([py.n_dishes, py.n_known, py.n_hints, py.n_rerun_hints], [12, 139, 2, 3]);
      for (const key of ["idea", "revision", "recipe", "rerun"]) assert.deepEqual(js[key], py[key], key);
      // The "(none ...)" fallbacks are gone
      assert.doesNotMatch(js.idea.user, /\(none picked|\(none listed/);
      assert.doesNotMatch(js.revision.user, /\(none listed/);
      assert.doesNotMatch(js.recipe.user, /\(none listed|\(none known/);
      // Pack sizes for the picked idea's main foods only; on a rerun also the last recipe's bought foods
      assert.match(js.recipe.user, /PACK SIZES \(use whole packs fully when you can\):\n- chicken breast: 500 g pack\n- rice: 1000 g pack\n\n/);
      assert.match(js.rerun.user, /:\n- chicken breast: 500 g pack\n- potato: loose, sold per 213 g\n- rice: 1000 g pack\n\nRERUN: attempt 2 of 3\./);
    });
});

test("the copied templates match prompts/ (rerun npm run prompts after editing prompts/)", () => {
  for (const name of ["idea", "revision", "recipe"]) {
    const source = fs.readFileSync(path.join(ROOT, "prompts", `${name}.md`), "utf8");
    const copy = fs.readFileSync(path.join(ROOT, "web", "generated", "prompts", `${name}.md`), "utf8");
    assert.equal(copy, source, name);
  }
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts", "kitchen-profile.default.json"), "utf8"));
  assert.deepEqual(defaultProfile(), profile);
  const dishes = fs.readFileSync(path.join(ROOT, "data", "open", "inspiration", "dishes.json"), "utf8");
  assert.equal(fs.readFileSync(path.join(ROOT, "web", "generated", "dishes.json"), "utf8"), dishes);
  const packs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "open", "packs", "packs.json"), "utf8")).foods;
  const slim = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "generated", "pack-sizes.json"), "utf8")).foods;
  assert.deepEqual(Object.keys(slim).sort(), Object.keys(packs).sort());
  for (const [food, e] of Object.entries(packs)) {
    assert.deepEqual([slim[food].sold_by, slim[food].default_grams, slim[food].units_per_pack ?? null],
      [e.sold_by, e.default_grams, e.units_per_pack ?? null], food);
  }
});

test("templates have both parts and no comments left; every placeholder is filled", () => {
  for (const name of ["idea", "revision", "recipe"]) {
    const t = loadTemplate(name);
    assert.ok(t.system && t.user);
    assert.ok(!(t.system + t.user).includes("<!--"));
  }
  const all = jsRender(CASE_1);
  for (const key of ["idea", "revision", "recipe"]) {
    for (const part of ["system", "user"]) assert.doesNotMatch(all[key][part], /\{\{\w+\}\}/, `${key}.${part}`);
  }
  assert.throws(() => fill("Hello {{name}} {{city}}", { name: "x" }), /city/);
});

test("profile edits change the prompt; empty lines and sections are left out", () => {
  const c = case2();
  const text = renderProfile(c.profile);
  assert.match(text, /About 600\.5 kcal per meal/);
  assert.match(text, /Proteins I like: tofu, eggs\./);
  assert.ok(!text.includes("mayonnaise") && !text.includes("Budget:"));
  assert.ok(!renderProfile(null).includes("Proteins I like"));
});

test("numbers are formatted like Python", () => {
  assert.equal(pyFixed(5.125, 2), "5.12"); // exact tie: round half to even
  assert.equal(pyFixed(450.5, 0), "450");
  assert.equal(pyFixed(451.5, 0), "452");
  assert.equal(pyFixed(0.015, 2), "0.01"); // 0.015 is a little under the tie in binary
  assert.equal(pyG(52.5), "52.5");
  assert.equal(pyG(1000), "1000");
  assert.equal(pyG(1234567.5), "1.23457e+06");
  assert.equal(pyG(0.00001234), "1.234e-05");
  assert.equal(pyDumps({ a: [1, "ñ"], b: null, c: { d: true } }), '{"a": [1, "ñ"], "b": null, "c": {"d": true}}');
});

test("food names map to the same English key as smartbite_engine/names.py", { skip: !hasPython && "no .venv/bin/python" }, async () => {
  const { canonical } = await import("../lib/names.js");
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "generated", "aliases.json"), "utf8"));
  const names = [...data.foods, ...Object.keys(data.aliases)];
  const probes = [...names, ...names.map((n) => `${n.toUpperCase()}s`), "Pechugas de pollo", "Champiñón", "yogur griego 0 %", "unknown food"];
  const run = spawnSync(PYTHON, ["-c", "import json,sys\nfrom smartbite_engine.names import canonical\nprint(json.dumps([canonical(n) for n in json.load(sys.stdin)]))"],
    { cwd: ROOT, input: JSON.stringify(probes), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(probes.map((n) => canonical(n)), JSON.parse(run.stdout));
});

// A rerun from an engine evaluation: Python evaluates the recipe (smartbite_engine.meal.evaluate, the code behind
// /api/evaluate) and builds rerun_info; JS builds rerunInfo from the same evaluation JSON. Both prompts must match.
const RERUN_FORM = { craving: "huevos con espinacas", servings: 3, budget_total_eur: 9, kcal_target: 420, protein_g_target: 38,
  keep_leftovers_low: true, carbs_g_max: 30 };
const RERUN_FIRST = { idea_id: "1", title: "Huevos con espinacas", servings: 3, prep_time_min: 20, steps: ["Cook."], ingredients: [
  { name: "huevos", grams_per_serving: 153, units_per_serving: 3, storage: "fresh", pantry: false, dry: false },
  { name: "spinach", grams_per_serving: 133.3, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
  { name: "arroz", grams_per_serving: 45, units_per_serving: 0, storage: "keeps", pantry: false, dry: true },
  { name: "aceite de oliva virgen extra", grams_per_serving: 7, units_per_serving: 0, storage: "keeps", pantry: true, dry: false },
  { name: "chorizo casero", grams_per_serving: 20, units_per_serving: 0, storage: "fresh", pantry: false, dry: false }] };

test("rerunInfo from an engine evaluation gives the same prompt as rerun_info in Python", { skip: !hasPython && "no .venv/bin/python" }, () => {
  const second = { ...RERUN_FIRST, ingredients: RERUN_FIRST.ingredients.map((i) => (i.name === "arroz" ? { ...i, grams_per_serving: 51 } : i)) };
  const run = spawnSync(PYTHON, ["-c", `
import json, sys
from smartbite_engine.meal import evaluate
from smartbite_engine.prompts import recipe_prompt, rerun_info
c = json.load(sys.stdin)
meal = evaluate(c["form"], c["idea"], c["second"])
rerun = rerun_info(meal, c["first"], 3)
print(json.dumps({"meal": meal, "rerun": rerun, "prompt": recipe_prompt(c["form"], c["idea"], rerun=rerun)}, ensure_ascii=False))
`], { cwd: ROOT, input: JSON.stringify({ form: RERUN_FORM, idea: IDEA, first: RERUN_FIRST, second }), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const py = JSON.parse(run.stdout);
  const rerun = rerunInfo(py.meal, RERUN_FIRST, 3);
  assert.deepEqual(rerun, py.rerun);
  assert.deepEqual(recipePrompt(RERUN_FORM, IDEA, { rerun }), py.prompt);
  const user = py.prompt.user;
  assert.match(user, /RERUN: attempt 3 of 3\./);
  assert.match(user, /OK ranges: kcal 378 to 462, protein 35 to 45 g, carbs at most 30 g/);
  assert.match(user, /- huevos: at most 3\.4 eggs \(first recipe 3\)/);
  assert.match(user, /- spinach: at most 153 g \(first recipe 133\.3 g\)/);
  assert.match(user, /- arroz: at most 51 g \(first recipe 45 g\)/);
  assert.doesNotMatch(user, /- aceite de oliva virgen extra: at most/);
  assert.match(user, /Unknown foods, left out of the totals \(use a name from KNOWN INGREDIENTS\): chorizo casero/);
});

test("OK ranges and gram limits are rounded inward, without float drift", () => {
  assert.deepEqual(targetRanges({ kcal_target: 450, protein_g_target: 45 }), { kcal: [405, 495], protein_g: [41, 54] });
  assert.deepEqual(targetRanges({ kcal_target: 500, protein_g_target: 40 }), { kcal: [450, 550], protein_g: [36, 48] });
  assert.match(formText({ craving: "x", servings: 1, kcal_target: 450, protein_g_target: 45 }),
    /Targets per serving: 450 kcal \(OK from 405 to 495\), 45 g protein \(OK from 41 to 54 g\)/);
  assert.deepEqual(gramLimits({ ingredients: [
    { name: "a", grams_per_serving: 170, units_per_serving: 0, pantry: false },
    { name: "b", grams_per_serving: 100, units_per_serving: 0, pantry: false },
    { name: "eggs", grams_per_serving: 102, units_per_serving: 2, pantry: false },
    { name: "oil", grams_per_serving: 10, units_per_serving: 0, pantry: true }] }), [
    { name: "a", first_grams: 170, max_grams: 195 }, { name: "b", first_grams: 100, max_grams: 115 },
    { name: "eggs", first_units: 2, max_units: 2.3 }]);
});

test("typicalPackHints lists only the foods asked for, once, by English key", () => {
  assert.deepEqual(typicalPackHints(["pechuga de pollo", "chicken breast", "dragon fruit", "arroz"]).map((h) => h.ingredient),
    ["chicken breast", "rice"]);
  assert.deepEqual(typicalPackHints([]), []);
});

test("air fryer gear reaches the prompt in plain words", () => {
  assert.match(formText({ ...FORM, gear: ["oven", "air_fryer"] }), /Cooking gear: oven, air fryer/);
});

test("import prompt: same text as smartbite_engine/prompts.py import_prompt", { skip: !hasPython && "no .venv/bin/python" }, () => {
  const paste = "  Huevos a la flamenca\n\nComensales: 4\n\n* 4 huevos grandes (tamaño L ó XL)\n* 1/8 litro vino blanco\n  ";
  const known = ["eggs", "potato", "tomato sauce", "Pechuga de pollo"];
  const js = importPrompt(paste, { knownIngredients: known });
  const py = spawnSync(PYTHON, ["-c", "import json,sys\nfrom smartbite_engine.prompts import import_prompt\nd=json.load(sys.stdin)\n" +
    "print(json.dumps(import_prompt(d['paste'], known_ingredients=d['known'])))"],
    { cwd: ROOT, input: JSON.stringify({ paste, known }), encoding: "utf8" });
  if (py.status !== 0) throw new Error(py.stderr);
  assert.deepEqual(js, JSON.parse(py.stdout));
  assert.ok(js.user.includes("* 1/8 litro vino blanco") && js.system.includes("WHOLE recipe"));
});
