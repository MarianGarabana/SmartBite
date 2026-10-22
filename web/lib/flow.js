// The recipe loop after the pick, in the browser: write the recipe (lib/llm.js), let the engine compute packs and
// macros (lib/engine.js, /api/evaluate), and when code finds macro misses or fresh food left over, ask the Recipe agent
// again with the RERUN block (attempt number, macros computed in code, the problems, the previous grams and the 15%
// cap; rerunInfo in lib/prompts.js). Up to 2 reruns, then the attempt with the fewest problems is kept. Same idea as
// the rerun loop of the personal app. The model still picks foods and grams only: every number here comes from code.
import { productsFor } from "./cartmath.js";
import { evaluateMeal } from "./engine.js";
import { writeRecipe } from "./llm.js";
import { MAX_ATTEMPTS, rerunInfo } from "./prompts.js";

export const MAX_RERUNS = MAX_ATTEMPTS - 1;

// Problems in one evaluated meal that start a rerun: each macro miss plus each high-leftover line. Other change
// requests (over_budget) do not start one, but ride along in the RERUN block when a rerun runs.
export function problemCount(meal) {
  const ev = meal?.evaluation || {};
  const misses = ev.macros?.misses?.length || 0;
  return misses + (ev.change_requests || []).filter((r) => r.reason === "high_leftover").length;
}

export const needsRerun = (meal) => problemCount(meal) > 0;

// The short line shown while the loop runs
export function progressText(p) {
  if (!p) return "";
  if (p.stage === "evaluate") return p.attempt > 1 ? `Checking macros (${p.attempt}/${p.total})...` : "Checking macros...";
  if (p.stage === "rerun") return `Adjusting grams (${p.attempt}/${p.total})...`;
  return "Writing your recipe...";
}

// The attempt kept: fewest problems; on a tie the later one, which had more feedback
export function bestAttempt(attempts) {
  return attempts.reduce((best, a) => (a.meal && (!best || a.problems <= best.problems) ? a : best), null);
}

// Runs the loop. recipe: a recipe already written for this idea (e.g. "Try again" after the engine failed); then the
// first write is skipped. products ({ food key: product } for the user's store, lib/store.js activeProducts) and
// country and region go to every engine call: product packs, prices and labels, and estimated prices (country "ES",
// region e.g. "ES-MD"), so the
// budget check, macros and their change requests use them. onProgress gets {stage: "recipe" | "evaluate" | "rerun", attempt, total}.
// Returns {meal, recipe, attempt, attempts: [{attempt, problems, misses, error?}]}.
// Errors on the first attempt are thrown as they are; an engine error carries the written recipe as error.recipe.
// A failed rerun (model or engine) ends the loop and keeps the best attempt so far.
export async function makeMeal({ idea, form, profile, llm, products = {}, country = null, region = null, recipe: given = null,
  maxReruns = MAX_RERUNS, onProgress = () => {} }) {
  const total = maxReruns + 1;
  const attempts = [];
  let first = null;
  let rerun = null;
  for (let attempt = 1; attempt <= total; attempt++) {
    let recipe;
    let meal;
    try {
      if (attempt === 1 && given) recipe = given;
      else {
        onProgress({ stage: attempt === 1 ? "recipe" : "rerun", attempt, total });
        recipe = await writeRecipe({ idea, form, profile, llm, rerun });
      }
      first = first || recipe;
      onProgress({ stage: "evaluate", attempt, total });
      try {
        meal = await evaluateMeal({ form, profile, picked_idea: idea, recipe, products: productsFor(recipe, products),
          country, region });
      } catch (e) {
        if (attempt === 1) e.recipe = recipe;
        throw e;
      }
    } catch (e) {
      if (attempt === 1) throw e;
      attempts.push({ attempt, problems: null, misses: [], error: e.message });
      break;
    }
    const problems = problemCount(meal);
    attempts.push({ attempt, recipe, meal, problems, misses: meal.evaluation.macros?.misses || [] });
    if (!needsRerun(meal) || attempt === total) break;
    rerun = rerunInfo(meal, first, attempt + 1, total);
  }
  const best = bestAttempt(attempts);
  return { meal: best.meal, recipe: best.recipe, attempt: best.attempt,
    attempts: attempts.map(({ attempt, problems, misses, error }) => ({ attempt, problems, misses, ...(error ? { error } : {}) })) };
}
