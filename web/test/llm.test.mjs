// lib/llm.js and lib/engine.js with fetch mocked: request shapes for Anthropic and OpenAI-compatible endpoints,
// one retry with the error list, and the key kept out of everything but the provider's header. No real API calls.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { missingMainFoods } from "../lib/contracts.js";
import { evaluateMeal } from "../lib/engine.js";
import { ANTHROPIC_URL, CALL_TIMEOUT_MS, TIMEOUT_MESSAGE, generateIdeas, redact, reviseIdea, writeRecipe } from "../lib/llm.js";

const KEY = "sk-ant-api03-SECRET-test-key-1234";
const OPENAI_KEY = "sk-proj-SECRET-openai-5678";
const FORM = { craving: "chicken rice bowl", exclude: [], kcal_target: 450, protein_g_target: 45, carbs_g_max: null, fat_g_max: null,
  budget_total_eur: 10, servings: 2, time_limit_min: 30, gear: ["oven"], reheat_at_work: true, keep_leftovers_low: true };
const MACROS = { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 };
const idea = (n) => ({ idea_id: String(n), name: `Idea ${n}`, one_line: "A real dish.", main_ingredients: ["chicken breast", "rice"],
  rough_macros: MACROS, image_prompt: "a bowl" });
const IDEAS = { ideas: [1, 2, 3, 4].map(idea) };
const RECIPE = { idea_id: "2", title: "Chicken rice bowl", servings: 2, prep_time_min: 30, steps: ["Cook."],
  ingredients: [{ name: "chicken breast", grams_per_serving: 170, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
    { name: "rice", grams_per_serving: 80, units_per_serving: 0, storage: "keeps", pantry: false, dry: true }] };
const ANTHROPIC = { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: KEY };
const OPENAI = { provider: "openai_compatible", model: "some-model", baseUrl: "https://api.example.test/v1/", apiKey: OPENAI_KEY, preset: "custom" };

// Mock fetch: each call takes the next reply; returns the list of calls
function mockFetch(replies) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: (r.status || 200) < 400, status: r.status || 200, statusText: "", json: async () => r.json };
  };
  return calls;
}
const anthropicReply = (data, extra = {}) => ({ json: { content: [{ type: "thinking", thinking: "", signature: "sig" },
  { type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }], stop_reason: "end_turn", ...extra } });
const openaiReply = (data) => ({ json: { choices: [{ message: { role: "assistant", content: JSON.stringify(data) }, finish_reason: "stop" }] } });

test("Anthropic: direct browser call with the Messages API request shape", async () => {
  const calls = mockFetch([anthropicReply(IDEAS)]);
  const out = await generateIdeas({ form: FORM, profile: null, llm: ANTHROPIC });
  assert.equal(out.ideas.length, 4);
  assert.equal(calls.length, 1);
  const { url, init, body } = calls[0];
  assert.equal(url, ANTHROPIC_URL);
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true" });
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.equal(body.max_tokens, 16000);
  assert.match(body.system, /You are the SmartBite Idea agent/);
  assert.match(body.system, /KITCHEN PROFILE/);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "user");
  assert.match(body.messages[0].content, /Craving: chicken rice bowl/);
  assert.deepEqual(body.output_config, { effort: "low" });
  assert.ok(!init.body.includes(KEY), "the key is only in the header, never in the body");
});

test("Anthropic: an invalid reply is retried once with the error list and the full assistant turn", async () => {
  const calls = mockFetch([anthropicReply({ ideas: [idea(1), idea(2), idea(3)] }), anthropicReply(IDEAS)]);
  const out = await generateIdeas({ form: FORM, profile: null, llm: ANTHROPIC });
  assert.equal(out.ideas.length, 4);
  assert.equal(calls.length, 2);
  const msgs = calls[1].body.messages;
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[1].content[0].type, "thinking", "the assistant content goes back unchanged, thinking block included");
  assert.match(msgs[2].content, /ideas: needs at least 4 items, got 3/);
  assert.match(msgs[2].content, /ONLY the corrected JSON object/);
  assert.equal(calls[1].body.system, calls[0].body.system);
});

test("invalid twice: stops with a clear error, no third call", async () => {
  const calls = mockFetch([anthropicReply("Here are your ideas!"), anthropicReply('{"ideas": []} done')]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: ANTHROPIC }), /ideas reply was not valid twice.*extra text/);
  assert.equal(calls.length, 2);
});

test("OpenAI-compatible: chat completions with JSON output, Bearer key, retry once", async () => {
  const calls = mockFetch([openaiReply({ ...RECIPE, servings: 3 }), openaiReply(RECIPE)]);
  const recipe = await writeRecipe({ idea: idea(2), form: FORM, profile: null, llm: OPENAI });
  assert.equal(recipe.title, "Chicken rice bowl");
  assert.equal(calls.length, 2);
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.example.test/v1/chat/completions");
  assert.deepEqual(init.headers, { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` });
  assert.equal(body.model, "some-model");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.messages.map((m) => m.role), ["system", "user"]);
  assert.match(body.messages[0].content, /SmartBite Recipe agent/);
  assert.match(body.messages[1].content, /Write the full recipe for 2 servings\./);
  assert.deepEqual(calls[1].body.messages.map((m) => m.role), ["system", "user", "assistant", "user"]);
  assert.match(calls[1].body.messages[3].content, /servings must be 2, got 3/);
});

// Decided 2026-11-01: Gemini thinks at "low" for ideas and changed ideas; the recipe and other endpoints get no field
test("Gemini: reasoning_effort low for ideas and revisions only; other endpoints never get it", async () => {
  const GEMINI = { ...OPENAI, model: "gemini-3.8-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", preset: "gemini" };
  let calls = mockFetch([openaiReply(IDEAS)]);
  await generateIdeas({ form: FORM, profile: null, llm: GEMINI });
  assert.equal(calls[0].body.reasoning_effort, "low");
  calls = mockFetch([openaiReply({ idea: idea(2) })]);
  await reviseIdea({ idea: idea(2), changes: "no rice", form: FORM, profile: null, llm: GEMINI });
  assert.equal(calls[0].body.reasoning_effort, "low");
  calls = mockFetch([openaiReply(RECIPE)]);
  await writeRecipe({ idea: idea(2), form: FORM, profile: null, llm: GEMINI });
  assert.equal("reasoning_effort" in calls[0].body, false);
  calls = mockFetch([openaiReply(IDEAS)]);
  await generateIdeas({ form: FORM, profile: null, llm: OPENAI });
  assert.equal("reasoning_effort" in calls[0].body, false);
});

test("OpenAI-compatible without a key (Ollama): no Authorization header", async () => {
  const calls = mockFetch([openaiReply(IDEAS)]);
  await generateIdeas({ form: FORM, profile: null, llm: { ...OPENAI, apiKey: "", baseUrl: "http://localhost:11434/v1" } });
  assert.equal(calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.deepEqual(calls[0].init.headers, { "content-type": "application/json" });
});

test("reviseIdea keeps the idea_id and adds the user's changes; a wrong id is retried", async () => {
  const changed = { ...idea(3), name: "Idea 3 without rice" };
  const calls = mockFetch([anthropicReply({ idea: { ...changed, idea_id: "9" } }), anthropicReply({ idea: changed })]);
  const out = await reviseIdea({ idea: { ...idea(3), changes: "more cucumber" }, changes: " no rice ", form: FORM, profile: null, llm: ANTHROPIC });
  assert.equal(out.idea_id, "3");
  assert.equal(out.changes, "more cucumber; no rice");
  assert.match(calls[0].body.messages[0].content, /THE USER'S CHANGES:\nno rice/);
  assert.match(calls[1].body.messages[2].content, /idea_id must stay "3"/);
});

test("writeRecipe rejects a recipe for another idea", async () => {
  mockFetch([anthropicReply({ ...RECIPE, idea_id: "1" })]);
  await assert.rejects(writeRecipe({ idea: idea(2), form: FORM, profile: null, llm: ANTHROPIC }), /idea_id must be "2"/);
});

test("errors never show the key; refusals and network errors are plain messages", async () => {
  mockFetch([{ status: 401, json: { error: { type: "authentication_error", message: `Incorrect API key provided: ${OPENAI_KEY}` } } }]);
  const err = await generateIdeas({ form: FORM, profile: null, llm: OPENAI }).catch((e) => e);
  assert.match(err.message, /did not accept the key \(401\)/);
  assert.ok(!err.message.includes("SECRET"), err.message);
  assert.equal(redact("key sk-abc123456789 here", ""), "key [key] here");

  mockFetch([{ status: 429, json: [{ error: { code: 429, message: "Quota exceeded for metric: free_tier_requests" } }] }]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: OPENAI }), /\(429\).*Quota exceeded/);
  mockFetch([{ status: 503, json: [{ error: { code: 503, message: "This model is currently experiencing high demand." } }] }]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: OPENAI }),
    { message: "The AI provider is busy right now (503). This is on their side, not yours: wait a minute and try again." });

  mockFetch([anthropicReply(IDEAS, { stop_reason: "refusal" })]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: ANTHROPIC }), /declined/);

  mockFetch([new TypeError("Failed to fetch")]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: OPENAI }), /api\.example\.test.*CORS/);

  const calls = mockFetch([anthropicReply(IDEAS)]);
  await assert.rejects(generateIdeas({ form: FORM, profile: null, llm: { ...ANTHROPIC, apiKey: "" } }), /Add your Anthropic API key/);
  assert.equal(calls.length, 0, "no request without a key");
});

// A provider that never answers: fetch (or the reply body) waits until the request is aborted
const hang = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => {
  const e = new Error("This operation was aborted");
  e.name = "AbortError";
  reject(e);
}));

test("a call with no answer stops after the time limit with a clear message", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["setTimeout"] });
  for (const [llm, slowPart] of [[OPENAI, "fetch"], [ANTHROPIC, "fetch"], [OPENAI, "body"]]) {
    let signal = null;
    globalThis.fetch = async (url, init) => {
      signal = init.signal;
      if (slowPart === "fetch") return hang(init.signal);
      return { ok: true, status: 200, statusText: "", json: () => hang(init.signal) };
    };
    const pending = generateIdeas({ form: FORM, profile: null, llm }).catch((e) => e);
    await new Promise((r) => setImmediate(r));
    assert.ok(signal, "fetch gets an abort signal");
    mock.timers.tick(CALL_TIMEOUT_MS - 1);
    assert.equal(signal.aborted, false, "still waiting just before the limit");
    mock.timers.tick(1);
    const err = await pending;
    assert.equal(err.name, "LlmError");
    assert.equal(err.message, TIMEOUT_MESSAGE, `${llm.provider} ${slowPart}`);
  }
  assert.equal(CALL_TIMEOUT_MS, 300000);
});

test("engine: POSTs {form, profile, picked_idea, recipe} to /api/evaluate, never the key", async () => {
  const meal = { form: FORM, picked_idea: idea(2), recipe: RECIPE, evaluation: { pack: { lines: [] }, macros: { per_serving: MACROS } } };
  const calls = mockFetch([{ json: meal }]);
  const out = await evaluateMeal({ form: FORM, profile: { id: "default" }, picked_idea: idea(2), recipe: RECIPE });
  assert.equal(out, meal);
  assert.equal(calls[0].url, "/api/evaluate");
  assert.deepEqual(Object.keys(calls[0].body), ["form", "profile", "picked_idea", "recipe"]);
  assert.ok(!calls[0].init.body.includes("sk-"));

  mockFetch([{ status: 404, json: null }]);
  await assert.rejects(evaluateMeal({ form: FORM, profile: null, picked_idea: idea(2), recipe: RECIPE }), /not running on this site yet/);
  mockFetch([{ json: { ok: true } }]);
  await assert.rejects(evaluateMeal({ form: FORM, profile: null, picked_idea: idea(2), recipe: RECIPE }), /not a finished meal/);
});

test("Ollama preset is offered only when the site runs on this computer", async () => {
  const { presetAvailable, presetById } = await import("../lib/providers.js");
  const ollama = presetById("ollama");
  assert.equal(presetAvailable(ollama, "127.0.0.1"), true);
  assert.equal(presetAvailable(ollama, "localhost"), true);
  assert.equal(presetAvailable(ollama, "smartbite.example.app"), false);
  assert.equal(presetAvailable(presetById("openai"), "smartbite.example.app"), true);
});

test("the hosted site calls only the listed model hosts or this computer; a local copy calls any", async () => {
  const { HOSTED_LLM_ORIGINS, endpointAllowed } = await import("../lib/providers.js");
  assert.deepEqual(HOSTED_LLM_ORIGINS, ["https://api.anthropic.com", "https://api.openai.com", "https://openrouter.ai",
    "https://generativelanguage.googleapis.com"]);
  const site = "smartbite.example.app";
  assert.equal(endpointAllowed("https://openrouter.ai/api/v1", site), true);
  assert.equal(endpointAllowed("http://localhost:11434/v1", site), true);
  assert.equal(endpointAllowed("http://127.0.0.1:1234/v1", site), true);
  assert.equal(endpointAllowed("https://api.together.xyz/v1", site), false);
  assert.equal(endpointAllowed("https://api.openai.com.evil.example/v1", site), false);
  assert.equal(endpointAllowed("not a url", site), false);
  assert.equal(endpointAllowed("https://api.together.xyz/v1", "localhost"), true);
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");
const ing = (name) => ({ name, grams_per_serving: 100, units_per_serving: 0, storage: "fresh", pantry: false, dry: false });

test("writeRecipe: a recipe that drops a main ingredient is retried once with the dropped foods", async () => {
  const picked = { ...idea(2), main_ingredients: ["chicken breast", "rice", "cucumber"] };
  const dropped = { ...RECIPE, ingredients: [...RECIPE.ingredients] };
  const kept = { ...RECIPE, ingredients: [...RECIPE.ingredients, ing("pepino")] };
  const calls = mockFetch([anthropicReply(dropped), anthropicReply(kept)]);
  const out = await writeRecipe({ idea: picked, form: FORM, profile: null, llm: ANTHROPIC });
  assert.equal(out.ingredients.length, 3);
  assert.equal(calls.length, 2);
  const retry = calls[1].body.messages[2].content;
  assert.match(retry, /- the recipe dropped main ingredients of the picked idea: cucumber\. Keep every food in main_ingredients \(chicken breast, rice, cucumber\)/);
  assert.doesNotMatch(retry, /dropped[^\n]*rice\./);
});

test("writeRecipe: dropping a main ingredient twice stops with the error, no third call", async () => {
  const picked = { ...idea(2), main_ingredients: ["chicken breast", "rice", "feta"] };
  const calls = mockFetch([anthropicReply(RECIPE), anthropicReply(RECIPE)]);
  await assert.rejects(writeRecipe({ idea: picked, form: FORM, profile: null, llm: ANTHROPIC }),
    /recipe reply was not valid twice.*dropped main ingredients of the picked idea: feta/);
  assert.equal(calls.length, 2);
});

// Cases for the kept-main-food rule: [main_ingredients, recipe ingredient names]
const KEEP_CASES = [
  [["chicken breast", "rice"], ["pechuga de pollo", "arroz basmati"]],
  [["chicken breast", "rice", "cucumber"], ["chicken breast", "basmati rice"]],
  [["canned tuna in water", "potato", "green beans"], ["Atun claro al natural lata", "patatas", "frozen green beans"]],
  [["Huevos", "tomate triturado", "red bell pepper"], ["eggs", "crushed tomatoes", "pimiento verde"]],
  [["greek yogurt 0%", "frozen mixed berries", "rolled oats"], ["yogur griego 0 %", "copos de avena"]],
  [["  ", "sweet potato", "dragon fruit"], ["boniato", "fruta"]],
  [["salmon", "quinoa"], []],
  // A specific kind keeps the general food after canonical(); the general food does not keep a specific one
  [["arroz", "tomate", "spinach"], ["basmati rice", "cherry tomatoes", "frozen spinach"]],
  [["basmati rice", "chicken breast"], ["rice", "chicken thigh"]],
];

test("missingMainFoods matches missing_main_foods in eval/checks.py", { skip: !fs.existsSync(PYTHON) && "no .venv/bin/python" }, () => {
  const run = spawnSync(PYTHON, ["-c", "import json,sys\nfrom eval.checks import missing_main_foods\n" +
    "print(json.dumps([missing_main_foods({'main_ingredients': m}, [{'name': n} for n in names]) for m, names in json.load(sys.stdin)]))"],
  { cwd: ROOT, input: JSON.stringify(KEEP_CASES), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const py = JSON.parse(run.stdout);
  const js = KEEP_CASES.map(([main, names]) => missingMainFoods({ main_ingredients: main }, names.map((name) => ({ name }))));
  assert.deepEqual(js, py);
  assert.ok(py.some((m) => m.length) && py.some((m) => !m.length), "the cases cover both kept and dropped foods");
  assert.deepEqual(js.slice(-2), [[], ["basmati rice"]]);
});
