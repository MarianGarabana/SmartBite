// The only module that talks to a language model. Calls go from the browser straight to the provider the user
// picked in the Profile, with the user's own key: Anthropic (tested) or one OpenAI-compatible endpoint (experimental).
// No SmartBite server sees the key or the prompts. The key goes only into the request header for that provider,
// is never logged, and is removed from any error text shown to the user.
//
// Prompts come from prompts/ (copied to generated/ before build) and are rendered like smartbite_engine/prompts.py,
// with the same inputs: 12 inspiration dishes picked for the request (lib/inspiration.js), the English food keys as
// known ingredients, and as pack hints the typical pack sizes of the picked idea's main foods (plus, on a rerun, the
// foods of the last recipe). The rerun loop itself (recipe -> engine -> rerun) is in lib/flow.js.
// Each reply is checked against docs/contracts; on a failure the model gets the error list once and replies again,
// like the accept step of the personal app. The recipe must also keep every main ingredient of the picked idea. The model picks foods and grams only: packs, macros, cost and
// leftovers come from the engine (lib/engine.js), never from the model.
import { missingMainFoods, parseReply, validateOutput } from "./contracts.js";
import { pickDishes } from "./inspiration.js";
import { foods } from "./names.js";
import { ideaPrompt, recipePrompt, revisionPrompt, typicalPackHints } from "./prompts.js";
import { ANTHROPIC, DEFAULT_ANTHROPIC_MODEL, OPENAI_COMPATIBLE } from "./providers.js";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 16000; // non-streaming default from the Messages API guidance; thinking counts inside it
// Effort per step (Anthropic output_config.effort). Ideas and revisions are short; the recipe needs more care.
const EFFORT = { ideas: "low", revision: "low", recipe: "medium" };
const LABEL = { ideas: "ideas", revision: "changed idea", recipe: "recipe" };
// Gemini thinking per step (OpenAI-compatible reasoning_effort, decided 2026-11-01). Without it Gemini 3 thinks at its
// default level: about 2,700 output tokens and a median 161 s for 4 ideas with gemini-3.8-flash (eval/results
// live-gemini-*-usage.json, October 2026). Ideas and revisions are rough; the recipe keeps the default until measured.
// Sent only to Gemini's endpoint: other OpenAI-compatible endpoints may reject the field.
const GEMINI_EFFORT = { ideas: "low", revision: "low" };
const GEMINI_HOST = "generativelanguage.googleapis.com";
// Time limit per model call (decided 2026-11-03), so a stuck call ends with a message instead of spinning forever.
// Live eval, successful calls: gemini-3.6-flash max 22 s, gemini-3.5-flash-lite max 3 s, gemini-3.8-flash max 575 s
// (8 of 36 calls over 5 min). Counts from the request until the whole reply is read.
export const CALL_TIMEOUT_MS = 5 * 60 * 1000;
export const TIMEOUT_MESSAGE = "The AI provider did not answer within 5 minutes, so SmartBite stopped waiting. " +
  "Try again, or pick a faster model in your Profile (for Gemini: gemini-3.6-flash).";

export class LlmError extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmError";
  }
}

// Removes the key (and anything shaped like one) from text that may reach the screen
export function redact(text, key) {
  let out = String(text ?? "");
  if (key) out = out.split(key).join("[your key]");
  return out.replace(/\bsk-[A-Za-z0-9_\-*.]{4,}/g, "[key]");
}

function checkSettings(llm) {
  if (!llm || (llm.provider !== ANTHROPIC && llm.provider !== OPENAI_COMPATIBLE)) throw new LlmError("Pick a provider in your Profile first.");
  if (llm.provider === ANTHROPIC && !llm.apiKey) throw new LlmError("Add your Anthropic API key in your Profile first.");
  if (llm.provider === OPENAI_COMPATIBLE) {
    if (!/^https?:\/\/[^\s]+$/i.test(llm.baseUrl || "")) throw new LlmError("Add the provider's base URL in your Profile first.");
    if (!llm.model) throw new LlmError("Add the model name in your Profile first.");
  }
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

async function post(url, headers, body, llm) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await send(url, headers, body, llm, controller.signal);
  } catch (e) {
    if (controller.signal.aborted) throw new LlmError(TIMEOUT_MESSAGE);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function send(url, headers, body, llm, signal) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw e;
    const where = hostOf(url);
    throw new LlmError(llm.provider === ANTHROPIC
      ? `Could not reach ${where}. Check your connection and try again.`
      : `Could not reach ${where}. Check the base URL, your connection, and that this provider allows calls from a browser (CORS).`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    if (signal.aborted) throw e;
  }
  if (!res.ok) {
    const err = Array.isArray(data) ? data[0] : data; // Gemini wraps errors in a list
    const detail = redact(err?.error?.message || err?.message || res.statusText || "", llm.apiKey);
    // 503 (decided 2026-11-01): the provider is overloaded, often on free keys; its own text adds nothing to this
    if (res.status === 503) {
      throw new LlmError("The AI provider is busy right now (503). This is on their side, not yours: wait a minute and try again.");
    }
    const lead = res.status === 401 || res.status === 403
      ? `The provider did not accept the key (${res.status}). Check it in your Profile.`
      : res.status === 429 ? "The provider says too many requests (429). Free keys allow only a few calls per minute and per day: wait a minute, or try again tomorrow."
        : `The provider answered with an error (${res.status}).`;
    throw new LlmError(detail ? `${lead} ${detail}` : lead);
  }
  if (!data) throw new LlmError("The provider sent a reply that is not JSON.");
  return data;
}

// One Messages API call. Returns the reply text and the assistant turn to send back on a retry (the full content,
// thinking blocks included, unchanged).
async function callAnthropic(llm, step, system, messages) {
  const data = await post(ANTHROPIC_URL, {
    "content-type": "application/json",
    "x-api-key": llm.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  }, {
    model: llm.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    output_config: { effort: EFFORT[step] },
  }, llm);
  if (data.stop_reason === "refusal") throw new LlmError("The model declined this request. Try a different craving or change.");
  if (data.stop_reason === "max_tokens") throw new LlmError("The reply was cut off before it ended. Try again.");
  const content = Array.isArray(data.content) ? data.content : [];
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, assistant: { role: "assistant", content } };
}

const isGemini = (baseUrl) => { try { return new URL(baseUrl).host === GEMINI_HOST; } catch { return false; } };

// Photos (decided 2026-11-09): keys that can make images make the recipe photo themselves, straight from the browser
// (each endpoint below is on the provider's own host, so the hosted site's CSP already allows it). CORS checked
// 2026-11-09 with a fake key: Gemini preflight 200 echoing the origin; OpenAI /images/generations and OpenRouter
// /images preflight 200/204 with "*". Prices per photo from the providers' pricing pages on 2026-11-09:
// - Gemini: Nano Banana 2 Lite, $0.0336 per 1K image; no image model is on the free tier.
// - OpenAI: gpt-image-1-mini at low quality, $0.005 to $0.006 per photo; OpenAI may ask for organization verification.
// - OpenRouter: the same OpenAI model at $8 per 1M image tokens, from the user's OpenRouter credit.
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const OPENAI_HOST = "api.openai.com";
const OPENROUTER_HOST = "openrouter.ai";
export const PHOTO_MAKERS = {
  gemini: { label: "Gemini", model: GEMINI_IMAGE_MODEL,
    cost: "Google charges about $0.03 per photo on paid keys; free keys cannot make images." },
  openai: { label: "OpenAI", model: "gpt-image-1-mini",
    cost: "OpenAI charges about $0.005 per photo (low quality). OpenAI may ask you to verify your organization first." },
  openrouter: { label: "OpenRouter", model: "openai/gpt-image-1-mini",
    cost: "Paid from your OpenRouter credit, under $0.01 per photo (low quality)." },
};
export const FREE_KEY_PHOTO = "Your Gemini key is on the free tier, and Google does not allow image models on free keys. " +
  "Turn on billing for the key in Google AI Studio, or make the photo by hand below.";

// Which provider can make the photo for this key: "gemini", "openai", "openrouter", or null (the manual card)
export function photoMaker(llm) {
  if (llm?.provider !== OPENAI_COMPATIBLE || !llm.apiKey) return null;
  const host = hostOf(llm.baseUrl);
  return host === GEMINI_HOST ? "gemini" : host === OPENAI_HOST ? "openai" : host === OPENROUTER_HOST ? "openrouter" : null;
}
export const usesGemini = (llm) => photoMaker(llm) === "gemini";

const toBlob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
const noImage = (who, why) => new LlmError(`${who} sent no image${why ? ` (${why})` : ""}. Try again, or make the photo by hand.`);

// One image call; returns the photo as a Blob. Errors are LlmError with the provider's reason (key never shown).
export async function generatePhoto({ prompt, llm }) {
  const maker = photoMaker(llm);
  if (!maker) throw new LlmError("Photos are made only with a Gemini, OpenAI or OpenRouter key.");
  if (!prompt) throw new LlmError("This meal has no photo prompt.");
  const origin = new URL(llm.baseUrl).origin;
  if (maker === "gemini") {
    let data;
    try {
      data = await post(`${origin}/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
        { "content-type": "application/json", "x-goog-api-key": llm.apiKey }, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
        }, llm);
    } catch (e) {
      // Free keys get 429 with "free_tier ... limit: 0" (seen 2026-11-09): waiting never helps, so say what does
      if (/free_tier/.test(e.message) && /limit: 0\b/.test(e.message)) throw new LlmError(FREE_KEY_PHOTO);
      throw e;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const image = parts.map((p) => p.inlineData || p.inline_data).find((d) => d?.data);
    if (!image) throw noImage("Gemini", data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason);
    return toBlob(image.data, image.mimeType || image.mime_type || "image/png");
  }
  const headers = { "content-type": "application/json", authorization: `Bearer ${llm.apiKey}` };
  const data = maker === "openai"
    ? await post(`${llm.baseUrl.replace(/\/+$/, "")}/images/generations`, headers,
      { model: PHOTO_MAKERS.openai.model, prompt, size: "1536x1024", quality: "low", output_format: "jpeg" }, llm)
    : await post(`${llm.baseUrl.replace(/\/+$/, "")}/images`, headers,
      { model: PHOTO_MAKERS.openrouter.model, prompt, aspect_ratio: "3:2", quality: "low", output_format: "jpeg" }, llm);
  const item = (data?.data || []).find((d) => d?.b64_json || /^data:image\//.test(d?.url || ""));
  if (!item) throw noImage(PHOTO_MAKERS[maker].label);
  if (item.b64_json) return toBlob(item.b64_json, "image/jpeg");
  const [, type, b64] = item.url.match(/^data:([^;]+);base64,(.*)$/) || [];
  if (!b64) throw noImage(PHOTO_MAKERS[maker].label);
  return toBlob(b64, type);
}

// One chat completions call with JSON output (OpenAI-compatible endpoints)
async function callOpenAi(llm, step, system, messages) {
  const headers = { "content-type": "application/json" };
  if (llm.apiKey) headers.authorization = `Bearer ${llm.apiKey}`;
  const body = {
    model: llm.model,
    messages: [{ role: "system", content: system }, ...messages],
    response_format: { type: "json_object" },
  };
  if (GEMINI_EFFORT[step] && isGemini(llm.baseUrl)) body.reasoning_effort = GEMINI_EFFORT[step];
  const data = await post(`${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`, headers, body, llm);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new LlmError("The reply was cut off before it ended. Try again.");
  const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
  return { text, assistant: { role: "assistant", content: text } };
}

const retryMessage = (errors) => "Your reply did not pass the checks:\n" + errors.map((e) => `- ${e}`).join("\n") +
  "\n\nReply again with ONLY the corrected JSON object, no other text.";

// Ask, check the reply, and on a failure send the errors back once. Returns the checked data.
async function askJson(llm, step, prompt, check) {
  checkSettings(llm);
  const call = llm.provider === ANTHROPIC ? callAnthropic : callOpenAi;
  let messages = [{ role: "user", content: prompt.user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, assistant } = await call(llm, step, prompt.system, messages);
    let [data, errors] = parseReply(text);
    if (!errors.length) errors = check(data);
    if (!errors.length) return data;
    if (attempt === 1) {
      throw new LlmError(`The ${LABEL[step]} reply was not valid twice. Try again. Last problems: ${errors.slice(0, 5).join("; ")}`);
    }
    messages = [...messages, assistant, { role: "user", content: retryMessage(errors) }];
  }
  throw new LlmError("unreachable");
}

// A new seed for each request, so asking again shows other dishes; tests pass their own
const newSeed = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

// 4 ideas (idea.schema.json Output) for the form and the Kitchen Profile. Unless given, the prompt gets 12 dishes
// picked for this request (seed) and the English food keys.
export async function generateIdeas({ form, profile, llm, seed = newSeed(), inspiration, knownIngredients }) {
  const dishes = inspiration ?? pickDishes(form?.craving ?? "", form?.exclude || [], { seed });
  const prompt = ideaPrompt(form, { profile, inspiration: dishes, knownIngredients: knownIngredients ?? foods() });
  return askJson(llm, "ideas", prompt, (data) => {
    const errors = validateOutput(data, "idea.schema.json");
    if (!errors.length) {
      const ids = data.ideas.map((i) => i.idea_id);
      if (new Set(ids).size !== ids.length) errors.push(`idea_id values must all be different, got ${ids.join(", ")}`);
    }
    return errors;
  });
}

// One idea rewritten with the user's changes (revision.schema.json). The changes are kept on the idea for the
// Recipe agent, added to the ones made before.
export async function reviseIdea({ idea, changes, form, profile, llm, knownIngredients }) {
  const text = String(changes || "").trim();
  if (!text) throw new LlmError("Write what you want to change first.");
  const prompt = revisionPrompt(form, idea, text, { profile, knownIngredients: knownIngredients ?? foods() });
  const data = await askJson(llm, "revision", prompt, (d) => {
    const errors = validateOutput(d, "revision.schema.json");
    if (!errors.length && d.idea.idea_id !== idea.idea_id) errors.push(`idea_id must stay "${idea.idea_id}", got "${d.idea.idea_id}"`);
    return errors;
  });
  return { ...data.idea, changes: idea.changes ? `${idea.changes}; ${text}` : text };
}

// Foods whose pack sizes the recipe prompt lists: the idea's main foods, plus the bought (non-pantry) foods of the
// last recipe on a rerun. Same as pack_hint_foods in smartbite_engine/prompts.py.
export const packHintFoods = (idea, rerun = null) => [...(idea?.main_ingredients || []),
  ...(rerun?.previous?.ingredients || []).filter((i) => !i.pantry).map((i) => i.name)];

// The recipe for the picked idea (recipe.schema.json Output). The engine then turns it into a Meal result.
// Unless given, the prompt gets the English food keys and the typical pack sizes of packHintFoods. rerun: null on
// the first try, else rerunInfo(...) from lib/prompts.js (the RERUN block with the macros code computed).
export async function writeRecipe({ idea, form, profile, llm, knownIngredients, packHints, rerun = null }) {
  const prompt = recipePrompt(form, idea, { profile, knownIngredients: knownIngredients ?? foods(),
    packHints: packHints ?? typicalPackHints(packHintFoods(idea, rerun)), rerun });
  return askJson(llm, "recipe", prompt, (r) => {
    const errors = validateOutput(r, "recipe.schema.json");
    if (errors.length) return errors;
    if (r.idea_id !== idea.idea_id) {
      errors.push(`idea_id must be "${idea.idea_id}", the picked idea "${idea.name}"; got ${JSON.stringify(r.idea_id ?? null)}. Write the recipe for that idea.`);
    }
    if (r.servings !== form.servings) errors.push(`servings must be ${form.servings}, got ${r.servings}`);
    const missing = missingMainFoods(idea, r.ingredients);
    if (missing.length) {
      errors.push(`the recipe dropped main ingredients of the picked idea: ${missing.join(", ")}. Keep every food in ` +
        `main_ingredients (${idea.main_ingredients.join(", ")}); change grams or other foods instead.`);
    }
    return errors;
  });
}
