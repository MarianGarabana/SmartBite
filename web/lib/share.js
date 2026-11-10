// Shareable recipe link (decided 2026-11-09). The recipe travels in the address after "#" (/r#<code>), so it never
// reaches a server. Only the recipe goes in: name, servings, time, foods and grams, steps, the photo prompt, rough
// macros and the kcal and protein targets. Nothing about the person who shares it: no country, prices, products,
// profile, budget or craving. The person who opens it gets macros, packs and prices worked out again for their own
// country (app/r, components/SharedRecipe.jsx).
// Code: JSON, deflate-raw (CompressionStream, in browsers and Node 18+), base64url. Pure apart from those streams.

export const SHARE_PATH = "/r";
export const SHARE_VERSION = 1;
const MAX_CODE = 8000; // characters after "#": a recipe is about 1,500
const MAX_JSON = 32_000; // bytes after unzipping, so a crafted link cannot unzip into something huge

export class ShareError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShareError";
  }
}

// --- bytes <-> base64url ---
function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new ShareError("bad characters");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Stops reading once the output passes MAX_JSON
async function inflate(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_JSON) {
      reader.cancel().catch(() => {});
      throw new ShareError("too big");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// --- what goes in the link ---
const round1 = (n) => Math.round(n * 10) / 10;

// The shared part of a meal page's meal (lib/meal.js toMeal): its recipe and idea as saved, and its targets
export function sharePayload(meal) {
  const recipe = meal.source?.recipe;
  if (!recipe) throw new ShareError("This meal has no recipe to share.");
  const idea = meal.idea || {};
  const per = meal.perServing || {};
  return {
    v: SHARE_VERSION,
    recipe: {
      title: recipe.title,
      servings: recipe.servings,
      prep_time_min: recipe.prep_time_min,
      ingredients: recipe.ingredients.map((it) => ({
        name: it.name, grams_per_serving: it.grams_per_serving, units_per_serving: it.units_per_serving || 0,
        storage: it.storage, pantry: !!it.pantry, dry: !!it.dry,
        ...(it.note ? { note: it.note } : {}), ...(it.leftover_plan ? { leftover_plan: it.leftover_plan } : {}),
      })),
      steps: recipe.steps,
      ...(recipe.note ? { note: recipe.note } : {}),
    },
    idea: {
      one_line: idea.one_line || "",
      main_ingredients: Array.isArray(idea.main_ingredients) ? idea.main_ingredients : [],
      image_prompt: idea.image_prompt || "",
      rough_macros: { kcal: round1(per.kcal || 0), protein_g: round1(per.protein_g || 0), carbs_g: round1(per.carbs_g || 0),
        fat_g: round1(per.fat_g || 0) },
    },
    targets: { kcal: meal.targets?.kcal ?? null, protein: meal.targets?.protein ?? null,
      carbsMax: meal.targets?.carbsMax ?? null, fatMax: meal.targets?.fatMax ?? null },
  };
}

export async function encodeShare(payload) {
  return toBase64Url(await deflate(new TextEncoder().encode(JSON.stringify(payload))));
}

export const shareUrl = (origin, code) => `${origin}${SHARE_PATH}#${code}`;

// --- reading a link: everything in it is untrusted, so only known fields of the right type and size come out ---
const STORAGE = new Set(["fresh", "keeps", "frozen"]);
const text = (v, max, { required = true } = {}) => {
  if (v == null || v === "") {
    if (required) throw new ShareError("missing text");
    return "";
  }
  if (typeof v !== "string") throw new ShareError("not text");
  const t = v.trim();
  if (required && !t) throw new ShareError("missing text");
  if (t.length > max) throw new ShareError("text too long");
  return t;
};
const number = (v, min, max, { integer = false } = {}) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    throw new ShareError("bad number");
  }
  return v;
};
const target = (v, max) => (v == null ? null : number(v, 0.1, max));
const list = (v, min, max) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new ShareError("bad list");
  return v;
};

export function cleanPayload(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== SHARE_VERSION) throw new ShareError("unknown version");
  const r = raw.recipe || {};
  const recipe = {
    title: text(r.title, 100),
    servings: number(r.servings, 1, 8, { integer: true }),
    prep_time_min: number(r.prep_time_min, 0, 1440, { integer: true }),
    ingredients: list(r.ingredients, 1, 40).map((it) => {
      if (!it || typeof it !== "object") throw new ShareError("bad food");
      if (!STORAGE.has(it.storage)) throw new ShareError("bad storage");
      if (it.leftover_plan != null && it.leftover_plan !== "use_in_another_meal") throw new ShareError("bad leftover plan");
      const note = text(it.note, 80, { required: false });
      return {
        name: text(it.name, 60),
        grams_per_serving: number(it.grams_per_serving, 0.01, 5000),
        units_per_serving: number(it.units_per_serving ?? 0, 0, 24),
        storage: it.storage,
        pantry: it.pantry === true,
        dry: it.dry === true,
        ...(note ? { note } : {}),
        ...(it.leftover_plan ? { leftover_plan: it.leftover_plan } : {}),
      };
    }),
    steps: list(r.steps, 1, 40).map((s) => text(s, 1000)),
  };
  const note = text(r.note, 200, { required: false });
  if (note) recipe.note = note;
  const i = raw.idea || {};
  const m = i.rough_macros || {};
  const idea = {
    one_line: text(i.one_line, 140, { required: false }),
    main_ingredients: list(i.main_ingredients ?? [], 0, 8).map((x) => text(x, 60)),
    image_prompt: text(i.image_prompt, 2000, { required: false }),
    rough_macros: { kcal: number(m.kcal ?? 0, 0, 10000), protein_g: number(m.protein_g ?? 0, 0, 1000),
      carbs_g: number(m.carbs_g ?? 0, 0, 1000), fat_g: number(m.fat_g ?? 0, 0, 1000) },
  };
  const t = raw.targets || {};
  const targets = { kcal: target(t.kcal, 5000), protein: target(t.protein, 1000), carbsMax: target(t.carbsMax, 1000),
    fatMax: target(t.fatMax, 1000) };
  return { v: SHARE_VERSION, recipe, idea, targets };
}

export async function decodeShare(code) {
  const c = String(code || "").replace(/^#/, "").trim();
  if (!c) throw new ShareError("empty");
  if (c.length > MAX_CODE) throw new ShareError("too long");
  let raw;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await inflate(fromBase64Url(c))));
  } catch (e) {
    throw e instanceof ShareError ? e : new ShareError("cannot read");
  }
  return cleanPayload(raw);
}

// --- the engine request for the person who opens the link: their profile and budget, the sender's recipe ---
const DEFAULT_KCAL = 450;
const DEFAULT_PROTEIN = 45;

export function sharedRequest(payload, { budgetPerServing, ideaId = "shared" }) {
  const { recipe, idea, targets } = payload;
  const servings = recipe.servings;
  // The idea's main foods must be at least 2 (idea contract); a recipe shared without them uses its first foods
  const bought = recipe.ingredients.filter((it) => !it.pantry).map((it) => it.name);
  const main = idea.main_ingredients.length >= 2 ? idea.main_ingredients : bought.slice(0, 8);
  const mainFoods = main.length >= 2 ? main : [...main, ...recipe.ingredients.map((it) => it.name)].slice(0, 2);
  return {
    form: {
      craving: recipe.title,
      exclude: [],
      kcal_target: targets.kcal ?? DEFAULT_KCAL,
      protein_g_target: targets.protein ?? DEFAULT_PROTEIN,
      carbs_g_max: targets.carbsMax,
      fat_g_max: targets.fatMax,
      budget_total_eur: Math.max(0.5, Math.round(budgetPerServing * servings * 2) / 2),
      servings,
      time_limit_min: null,
      gear: [],
      reheat_at_work: false,
      keep_leftovers_low: true,
    },
    picked_idea: {
      idea_id: ideaId,
      name: recipe.title.slice(0, 60),
      one_line: idea.one_line || recipe.title.slice(0, 140),
      main_ingredients: mainFoods,
      rough_macros: idea.rough_macros,
      image_prompt: idea.image_prompt,
    },
    recipe: { ...recipe, idea_id: ideaId },
  };
}

// The same link opened twice opens the same meal: its address is the name plus a short hash of the code
export function sharedSlug(title, code) {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const name = String(title || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meal";
  return `${name}-shared-${h.toString(36)}`;
}
