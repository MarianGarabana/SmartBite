// Paste a recipe (decided 2026-11-09, Q6-Q11 and Q14): the user's AI reads a pasted recipe (lib/llm.js importRecipe,
// prompts/import.md) into foods with whole-recipe grams; code weighs counted pieces (lib/pieces.js), divides by the
// servings the text states (or the ones the user picks) and builds the same engine request as a shared recipe, with
// the user's own targets. The recipe stays as written: no food is changed to hit the targets. Pure: no browser APIs.
import { foods } from "./names.js";
import { applyPieces } from "./pieces.js";
import { sharedRequest } from "./share.js";

export const MAX_PASTE = 20000; // characters; a long blog page pasted whole is cut by the user, not sent
export const MAX_SERVINGS = 8; // the engine plans 1 to 8 servings (recipe.schema.json)
const EGG_GRAMS = 51; // size M, as everywhere in SmartBite
const NO_STEPS = "No steps were pasted. Cook it as in the original recipe.";

// A pasted link instead of a recipe (decided 2026-11-10): SmartBite never opens websites (Q6), and a model given only
// an address could invent a recipe from its words. True when the text has a web address and, without it, almost
// nothing else: fewer than 3 lines and fewer than 60 characters. A recipe with its source link at the end passes.
export const LINK_MESSAGE = "That looks like a link. SmartBite does not open websites: open the page, select the ingredients " +
  "and the steps, copy them, and paste the text here.";
const URL_PATTERN = String.raw`\b(?:https?:\/\/|www\.)\S+`;
export function looksLikeLink(text) {
  const s = String(text ?? "");
  if (!new RegExp(URL_PATTERN, "i").test(s)) return false; // no "g" flag here: a global regex keeps its place between calls
  const rest = s.replace(new RegExp(URL_PATTERN, "gi"), " ").split("\n").map((l) => l.trim()).filter(Boolean);
  return rest.length < 3 && rest.join(" ").length < 60;
}

// True when the user has to say how many servings to cook: the text states none, or more than SmartBite plans
export const needsServings = (reply) => reply.servings == null || reply.servings > MAX_SERVINGS;

const round1 = (x) => Math.round(x * 10) / 10;

// The engine request for an imported recipe, and the lines the user should check in the editor.
// servings: what the user cooks (1-8); the grams per serving come from the servings the text states, else from it.
export function importedRequest(reply, { servings, targets = {}, budgetPerServing }) {
  const cooked = Math.min(MAX_SERVINGS, Math.max(1, Math.round(Number(servings) || reply.servings || 1)));
  const per = reply.servings ?? cooked;
  const known = new Set(foods());
  const weighed = applyPieces(reply);
  const check = [];
  const ingredients = weighed.ingredients.map((ing) => {
    const eggs = ing.units_total > 0;
    const units = eggs ? round1(ing.units_total / per) : 0;
    const grams = eggs ? round1(units * EGG_GRAMS) : Math.max(0.1, round1(ing.grams_total / per));
    if (!known.has(ing.name)) check.push({ name: ing.name, why: "unknown" });
    else if (ing.guessed) check.push({ name: ing.name, why: "guessed" });
    return { name: ing.name, grams_per_serving: grams, units_per_serving: units, storage: ing.storage, pantry: ing.pantry,
      dry: ing.dry, ...(ing.note && { note: ing.note.slice(0, 80) }) };
  });
  const title = String(reply.title || "Imported recipe").trim().slice(0, 100);
  const recipe = { title, servings: cooked, prep_time_min: reply.prep_time_min, ingredients,
    steps: reply.steps.filter((s) => s.trim()).length ? reply.steps.filter((s) => s.trim()) : [NO_STEPS] };
  const idea = { one_line: title.slice(0, 140), main_ingredients: [],
    image_prompt: `Overhead photo of ${title}, plated as in the recipe, natural light, no text`,
    rough_macros: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } }; // unknown before the engine; never shown
  const request = sharedRequest({ recipe, idea, targets }, { budgetPerServing, ideaId: "imported" });
  return { request, check, textServings: reply.servings };
}

// A new address for each import, like a meal made here: the title plus a time stamp
export const importSlug = (title, now = Date.now()) => `${String(title || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recipe"}-${now.toString(36)}`;
