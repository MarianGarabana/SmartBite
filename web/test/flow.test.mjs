// lib/flow.js with fetch mocked: recipe -> /api/evaluate -> rerun with the RERUN block on macro misses or high
// leftovers, up to 2 reruns, then the attempt with the fewest problems. No real API calls, no engine.
import assert from "node:assert/strict";
import test from "node:test";
import { ANTHROPIC_URL } from "../lib/llm.js";
import { EVALUATE_URL } from "../lib/engine.js";
import { bestAttempt, makeMeal, needsRerun, problemCount, progressText } from "../lib/flow.js";

const LLM = { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-test-key-0000" };
const FORM = { craving: "chicken rice bowl", exclude: [], kcal_target: 450, protein_g_target: 45, carbs_g_max: null, fat_g_max: null,
  budget_total_eur: 10, servings: 2, time_limit_min: 30, gear: ["oven"], reheat_at_work: true, keep_leftovers_low: true };
const IDEA = { idea_id: "1", name: "Chicken rice bowl", one_line: "A bowl.", main_ingredients: ["chicken breast", "rice"],
  rough_macros: { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 }, image_prompt: "a bowl" };
const ing = (name, grams, extra = {}) => ({ name, grams_per_serving: grams, units_per_serving: 0, storage: "fresh", pantry: false, dry: false, ...extra });
const recipe = (chicken, rice = 70) => ({ idea_id: "1", title: "Chicken rice bowl", servings: 2, prep_time_min: 30, steps: ["Cook."],
  ingredients: [ing("chicken breast", chicken), ing("rice", rice, { storage: "keeps", dry: true }), ing("cucumber", 100),
    ing("extra virgin olive oil", 5, { storage: "keeps", pantry: true })] });

const MISS = { from_agent: "macro", ingredient: null, reason: "misses_macros",
  hint: "Per serving: protein 60 g is more than 20% over target 45 g: cut the protein ingredient. Adjust grams or swap ingredients." };
const LEFTOVER = { from_agent: "pack", ingredient: "cucumber", reason: "high_leftover", hint: "Buying 1000 g but using 200 g." };
const BUDGET = { from_agent: "pack", ingredient: "chicken breast", reason: "over_budget", hint: "Over budget." };

// An engine reply for a recipe: misses and change requests as given, macros per serving from the chicken grams
function mealFor(r, { misses = [], requests = [] } = {}) {
  const chicken = r.ingredients[0].grams_per_serving;
  const lines = r.ingredients.map((i) => ({ name: i.name, food: i.name, grams: i.grams_per_serving * 2, source: "test",
    amount: { kcal: i.grams_per_serving * 2.2, protein_g: i.name === "chicken breast" ? chicken * 0.46 : 2, carbs_g: 1, fat_g: 1 } }));
  return { form: FORM, picked_idea: IDEA, recipe: r, evaluation: { status: misses.length || requests.length ? "issues" : "ok",
    pack: { lines: [] }, change_requests: [...requests, ...(misses.length ? [MISS] : [])],
    macros: { per_serving: { kcal: 500, protein_g: chicken * 0.23, carbs_g: 40, fat_g: 10 }, total: {}, misses, lines,
      missing_nutrition: [], unresolved: [] } } };
}

// Mock fetch: model calls take the next recipe, engine calls the next verdict. Returns the call log.
function mockFetch({ recipes, verdicts }) {
  const calls = { model: [], engine: [] };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url === ANTHROPIC_URL) {
      calls.model.push(body.messages[0].content);
      const r = recipes[Math.min(calls.model.length - 1, recipes.length - 1)];
      const text = typeof r === "string" ? r : JSON.stringify(r);
      return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }] }) };
    }
    assert.equal(url, EVALUATE_URL);
    calls.engine.push(body);
    const v = verdicts[calls.engine.length - 1];
    if (v instanceof Error) throw v;
    return { ok: true, status: 200, json: async () => mealFor(body.recipe, v) };
  };
  return calls;
}

const run = (extra = {}) => {
  const progress = [];
  return { progress, out: makeMeal({ idea: IDEA, form: FORM, profile: null, llm: LLM, onProgress: (p) => progress.push(progressText(p)), ...extra }) };
};

test("no misses: one recipe, one engine call, no rerun", async () => {
  const calls = mockFetch({ recipes: [recipe(150)], verdicts: [{}] });
  const { progress, out } = run();
  const res = await out;
  assert.equal(calls.model.length, 1);
  assert.equal(calls.engine.length, 1);
  assert.equal(res.attempt, 1);
  assert.deepEqual(res.attempts, [{ attempt: 1, problems: 0, misses: [] }]);
  assert.deepEqual(progress, ["Writing your recipe...", "Checking macros..."]);
  assert.doesNotMatch(calls.model[0], /RERUN/);
  // Pack sizes for the idea's main foods only on the first try
  assert.match(calls.model[0], /PACK SIZES \(use whole packs fully when you can\):\n- chicken breast: 500 g pack\n- rice: 1000 g pack\n\n/);
});

test("a macro miss starts a rerun with the RERUN block; the fixed recipe is kept", async () => {
  const miss = ["protein 60 g is more than 20% over target 45 g: cut the protein ingredient"];
  const calls = mockFetch({ recipes: [recipe(260), recipe(150, 80)], verdicts: [{ misses: miss }, {}] });
  const { progress, out } = run();
  const res = await out;
  assert.equal(calls.model.length, 2);
  assert.equal(calls.engine.length, 2);
  assert.equal(res.attempt, 2);
  assert.equal(res.recipe.ingredients[0].grams_per_serving, 150);
  assert.deepEqual(res.meal.recipe, res.recipe);
  assert.deepEqual(res.attempts.map((a) => a.problems), [1, 0]);
  assert.deepEqual(progress, ["Writing your recipe...", "Checking macros...", "Adjusting grams (2/3)...", "Checking macros (2/3)..."]);
  const user = calls.model[1];
  assert.match(user, /RERUN: attempt 2 of 3\./);
  assert.match(user, /YOUR PREVIOUS RECIPE:\n\{"idea_id": "1".*"grams_per_serving": 260/);
  assert.match(user, /MACROS PER SERVING, COMPUTED IN CODE:\n- chicken breast, 260 g: 286 kcal, 60 g protein/);
  assert.match(user, /PROBLEMS TO FIX:\n- misses_macros \(meal\): Per serving: protein 60 g is more than 20% over target/);
  assert.match(user, /GRAM LIMITS \(per serving, at most 15% over the first recipe; cuts are fine\):\n- chicken breast: at most 299 g \(first recipe 260 g\)\n- rice: at most 80 g \(first recipe 70 g\)\n- cucumber: at most 115 g \(first recipe 100 g\)\n/);
  // On a rerun the pack sizes add the last recipe's bought foods (cucumber), not its pantry oil
  assert.match(user, /PACK SIZES \(use whole packs fully when you can\):\n- chicken breast: 500 g pack\n- cucumber: loose, sold per 301 g\n- rice: 1000 g pack\n\n/);
});

test("a high leftover starts a rerun too; over budget alone does not", async () => {
  let calls = mockFetch({ recipes: [recipe(150), recipe(150)], verdicts: [{ requests: [LEFTOVER] }, {}] });
  let res = await run().out;
  assert.equal(calls.model.length, 2);
  assert.match(calls.model[1], /- high_leftover \(cucumber\): Buying 1000 g but using 200 g\./);
  assert.equal(res.attempt, 2);

  calls = mockFetch({ recipes: [recipe(150)], verdicts: [{ requests: [BUDGET] }] });
  res = await run().out;
  assert.equal(calls.model.length, 1);
  assert.equal(res.attempt, 1);
});

test("at most 2 reruns, then the attempt with the fewest problems; the cap counts from the first recipe", async () => {
  const two = ["kcal 600 vs target 450", "protein 60 g is more than 20% over target 45 g: cut the protein ingredient"];
  const calls = mockFetch({ recipes: [recipe(260), recipe(200), recipe(180)],
    verdicts: [{ misses: two }, { misses: ["kcal 520 vs target 450"] }, { misses: two }] });
  const res = await run().out;
  assert.equal(calls.model.length, 3);
  assert.equal(calls.engine.length, 3);
  assert.equal(res.attempt, 2);
  assert.equal(res.recipe.ingredients[0].grams_per_serving, 200);
  assert.deepEqual(res.attempts.map((a) => a.problems), [2, 1, 2]);
  assert.match(calls.model[2], /RERUN: attempt 3 of 3\./);
  assert.match(calls.model[2], /"grams_per_serving": 200/);
  assert.match(calls.model[2], /- chicken breast: at most 299 g \(first recipe 260 g\)/);
});

test("a failed rerun keeps the best attempt so far", async () => {
  const calls = mockFetch({ recipes: [recipe(260), "not json", "still not json"], verdicts: [{ misses: ["kcal 600 vs target 450"] }] });
  const res = await run().out;
  assert.equal(calls.model.length, 3); // the rerun and its one retry with the error list
  assert.equal(res.attempt, 1);
  assert.equal(res.attempts.length, 2);
  assert.match(res.attempts[1].error, /recipe reply was not valid twice/);
});

test("first attempt errors are thrown; an engine error carries the written recipe; a given recipe skips the write", async () => {
  mockFetch({ recipes: ["nope", "nope"], verdicts: [] });
  await assert.rejects(run().out, (e) => /not valid twice/.test(e.message) && e.recipe === undefined);

  mockFetch({ recipes: [recipe(150)], verdicts: [new TypeError("Failed to fetch")] });
  const err = await run().out.catch((e) => e);
  assert.match(err.message, /Could not reach the meal engine/);
  assert.equal(err.recipe.ingredients[0].grams_per_serving, 150);

  const calls = mockFetch({ recipes: [recipe(150)], verdicts: [{}] });
  const { progress, out } = run({ recipe: recipe(140) });
  const res = await out;
  assert.equal(calls.model.length, 0);
  assert.equal(res.recipe.ingredients[0].grams_per_serving, 140);
  assert.deepEqual(progress, ["Checking macros..."]);
});

test("the country goes to every engine call, first try and reruns", async () => {
  const calls = mockFetch({ recipes: [recipe(260), recipe(150)], verdicts: [{ misses: ["kcal 600 vs target 450"] }, {}] });
  await run({ country: "ES" }).out;
  assert.deepEqual(calls.engine.map((b) => b.country), ["ES", "ES"]);
  const none = mockFetch({ recipes: [recipe(150)], verdicts: [{}] });
  await run().out;
  assert.ok(!("country" in none.engine[0]), "no country key without a country");
});

test("problem count, rerun trigger, best attempt and progress text", () => {
  const r = recipe(150);
  assert.equal(problemCount(mealFor(r, { misses: ["a", "b"], requests: [LEFTOVER, BUDGET] })), 3);
  assert.equal(needsRerun(mealFor(r, { requests: [BUDGET] })), false);
  assert.equal(needsRerun(mealFor(r, { requests: [LEFTOVER] })), true);
  assert.equal(bestAttempt([{ attempt: 1, meal: {}, problems: 1 }, { attempt: 2, meal: {}, problems: 1 }]).attempt, 2);
  assert.equal(bestAttempt([{ attempt: 1, meal: {}, problems: 0 }, { attempt: 2, problems: null, error: "x" }]).attempt, 1);
  assert.equal(progressText({ stage: "rerun", attempt: 3, total: 3 }), "Adjusting grams (3/3)...");
  assert.equal(progressText(null), "");
});
