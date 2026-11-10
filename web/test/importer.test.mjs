// Paste a recipe: lib/importer.js (reply -> engine request) and importRecipe in lib/llm.js, with fetch mocked.
// The replies are real ones from the eval (eval/recipe_import/replies/v3-sonnet), so the shapes are what a model sends.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateOutput } from "../lib/contracts.js";
import { MAX_PASTE, importSlug, importedRequest, needsServings } from "../lib/importer.js";
import { importRecipe } from "../lib/llm.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stored = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "replies", "v3-sonnet", `${id}.json`), "utf8")).reply;
const KEY = "sk-ant-api03-SECRET-import-test";
const ANTHROPIC = { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: KEY };

test("import: a recipe with stated servings becomes a valid engine request, pieces weighed by code", () => {
  const reply = stored("es-huevos-flamenca"); // Comensales: 4, "4 patatas grandes" as 4 large pieces
  assert.equal(needsServings(reply), false);
  const { request, check, textServings } = importedRequest(reply, { targets: { kcal: 500, protein: 40 }, budgetPerServing: 3 });
  assert.equal(textServings, 4);
  assert.equal(request.form.servings, 4);
  assert.equal(request.form.kcal_target, 500);
  assert.deepEqual(validateOutput(request.recipe, "recipe.schema.json"), []);
  assert.deepEqual(validateOutput({ idea: request.picked_idea }, "revision.schema.json"), []);
  const potato = request.recipe.ingredients.find((i) => i.name === "potato");
  assert.equal(potato.grams_per_serving, 369); // 4 x 369 g (USDA large) / 4 servings, not the model's own guess
  const eggs = request.recipe.ingredients.find((i) => i.name === "eggs");
  assert.deepEqual([eggs.units_per_serving, eggs.grams_per_serving], [1, 51]);
  assert.equal(request.picked_idea.idea_id, "imported");
  assert.ok(check.some((c) => c.why === "unknown" && /chorizo/.test(c.name)), "chorizo is not a known food: check it");
  assert.ok(check.some((c) => c.why === "guessed"), "olive oil with no amount: check it");
});

test("import: no servings in the text, the user's number is used for the grams per serving", () => {
  const reply = stored("en-lentil-soup");
  assert.equal(reply.servings, null);
  assert.equal(needsServings(reply), true);
  const { request } = importedRequest(reply, { servings: 3, targets: {}, budgetPerServing: 3 });
  assert.equal(request.form.servings, 3);
  const lentils = request.recipe.ingredients.find((i) => i.name === "dried lentils");
  const whole = reply.ingredients.find((i) => i.name === "dried lentils").grams_total;
  assert.equal(lentils.grams_per_serving, Math.round((whole / 3) * 10) / 10);
  assert.deepEqual(validateOutput(request.recipe, "recipe.schema.json"), []);
});

test("import: more than 8 stated servings are asked; the grams still come from the text's servings", () => {
  const reply = { ...stored("en-frittata"), servings: 10 };
  assert.equal(needsServings(reply), true);
  const { request } = importedRequest(reply, { servings: 4, targets: {}, budgetPerServing: 3 });
  assert.equal(request.form.servings, 4);
  const eggs = request.recipe.ingredients.find((i) => i.name === "eggs");
  assert.equal(eggs.units_per_serving, 0.8); // 8 eggs for 10 servings
});

test("import: no pasted steps still gives a valid recipe; addresses are new each time", () => {
  const reply = { ...stored("en-tuna-salad"), steps: [] };
  const { request } = importedRequest(reply, { servings: 2, targets: {}, budgetPerServing: 3 });
  assert.equal(request.recipe.steps.length, 1);
  assert.deepEqual(validateOutput(request.recipe, "recipe.schema.json"), []);
  assert.notEqual(importSlug("Tuna Salad", 1), importSlug("Tuna Salad", 2));
  assert.match(importSlug("Huevos a la flamenca", 1), /^huevos-a-la-flamenca-/);
});

function mockFetch(replies) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: true, status: 200, statusText: "", json: async () => r };
  };
  return calls;
}
const anthropicReply = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }], stop_reason: "end_turn" });

test("importRecipe: the recipe call's settings, the paste in the prompt, one retry with the errors", async () => {
  const good = stored("en-shakshouka");
  const calls = mockFetch([anthropicReply({ title: "x" }), anthropicReply(good)]);
  const paste = fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "pastes", "en-shakshouka.txt"), "utf8");
  const out = await importRecipe({ paste, llm: ANTHROPIC });
  assert.deepEqual(out, good);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.output_config, { effort: "medium" });
  assert.match(calls[0].body.system, /Recipe import agent/);
  assert.match(calls[0].body.messages[0].content, /6 cloves garlic, minced/);
  assert.match(calls[1].body.messages.at(-1).content, /did not pass the checks/);
  assert.ok(!calls[0].init.body.includes(KEY));
});

test("importRecipe: empty or very long pastes are refused before any call", async () => {
  const calls = mockFetch([]);
  await assert.rejects(importRecipe({ paste: "   ", llm: ANTHROPIC }), /Paste a recipe first/);
  await assert.rejects(importRecipe({ paste: "x".repeat(MAX_PASTE + 1), llm: ANTHROPIC }), /Paste only the recipe/);
  assert.equal(calls.length, 0);
});
