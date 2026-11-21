// "Fit to packs" (decided 2026-11-20): the Cart's "Adjust leftovers to meals" (lib/adjust.js, code only) run on one
// meal made in this browser, from its recipe page or its My Recipes card. Unlike the Cart, Apply changes the saved meal
// (Marian's exception to "saved meals never change", for this button only): new grams per serving and servings, then
// the engine recomputes packs, macros and cost. The meal as it was before the first fit is kept on the meal as
// before_fit, so Undo brings it back exactly; another fit keeps that first copy. Pure: no storage, no engine call.
import { applySuggestions, suggest, summary } from "./adjust";
import { norm } from "./cartmath";

const itemOf = (meal) => ({ slug: meal.slug, servings: meal.servings });
const MONEY = (n) => Math.round(n * 100) / 100;

// { before, suggestions, after } for one meal as the pages show it (lib/meal.js toMeal, with the user's prices)
export function fitInfo(meal) {
  if (!meal?.lines?.length) return { before: null, suggestions: [], after: null };
  const items = [itemOf(meal)];
  const bySlug = { [meal.slug]: meal };
  const suggestions = suggest(items, bySlug);
  return { before: summary(items, bySlug), suggestions,
    after: summary(applySuggestions(items, suggestions, suggestions.map((s) => s.id)), bySlug) };
}

// Leftovers and cost with only the ticked suggestions
export function fitPreview(meal, ids) {
  const items = [itemOf(meal)];
  const bySlug = { [meal.slug]: meal };
  return summary(applySuggestions(items, suggest(items, bySlug), ids), bySlug);
}

// The saved meal's form and recipe with the ticked suggestions: servings, and grams per serving for the foods they
// change (never eggs, which are counted in units). The budget is for all servings, so it follows the servings.
export function fittedRecipe(doc, meal, ids) {
  const items = [itemOf(meal)];
  const bySlug = { [meal.slug]: meal };
  const item = applySuggestions(items, suggest(items, bySlug), ids)[0];
  const grams = item.grams || {};
  const servings = item.servings;
  const ingredients = doc.recipe.ingredients.map((it) => {
    const g = grams[norm(it.name)];
    return g != null && !(it.units_per_serving > 0) ? { ...it, grams_per_serving: g } : it;
  });
  const old = doc.form.servings || doc.recipe.servings;
  const budget = doc.form.budget_total_eur;
  const form = { ...doc.form, servings, ...(budget ? { budget_total_eur: MONEY((budget * servings) / old) } : {}) };
  return { form, recipe: { ...doc.recipe, servings, ingredients } };
}

// The saved meal after the engine ran the fitted recipe (out: its Meal result). Keeps the meal's own fields (date,
// photo, tags, shared or imported) and the copy from before the first fit.
export function withFit(doc, out) {
  const { before_fit: first, ...rest } = doc;
  return { ...rest, form: out.form, picked_idea: out.picked_idea, recipe: out.recipe, evaluation: out.evaluation,
    before_fit: first || { form: doc.form, recipe: doc.recipe, evaluation: doc.evaluation } };
}

// The meal as it was before the first fit
export function undoFit(doc) {
  const { before_fit: first, ...rest } = doc;
  return first ? { ...rest, ...first } : doc;
}
