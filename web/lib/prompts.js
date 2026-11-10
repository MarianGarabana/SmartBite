// Prompt files filled with the form, the Kitchen Profile and the request data. JS port of
// smartbite_engine/prompts.py: same templates (copied to generated/ before build), same output text.
// Templates split on the "<!-- system -->" and "<!-- user -->" lines, other HTML comments are dropped, and each
// {{name}} is replaced with its text. Pure: no browser or Node APIs.
import { DEFAULT_PROFILE, PACK_SIZES, TEMPLATES } from "../generated/index.js";
import { canonical, english } from "./names.js";

const MARKER = /^<!-- (system|user) -->[ \t]*$/m;
const COMMENT = /<!--[\s\S]*?-->/g;
const PLACEHOLDER = /\{\{(\w+)\}\}/g;
const GEAR_WORDS = { microwave_only: "microwave only", oven: "oven", air_fryer: "air fryer", no_blender: "no blender" };
const NO_KNOWN = "(none listed: use plain English food names)";
export const MAX_ATTEMPTS = 3; // the first recipe plus up to 2 reruns
const INCREASE_CAP = 0.15; // on a rerun a bought ingredient grows at most 15% over the first recipe
const MACRO_FIELDS = ["kcal", "protein_g", "carbs_g", "fat_g"];
const EPS = 1e-9; // keeps 54.0 from flooring to 53 when the float product lands just under it

// ---- Python number formatting -------------------------------------------------------------------------------
// Python's format() rounds exact ties to even (f"{5.125:.2f}" is "5.12"); JS toFixed rounds them up. The exact
// decimal value of the double comes from toFixed(100), which is exact for the sizes used here.
function roundDecimalString(digits, places) {
  const [int, frac = ""] = digits.split(".");
  const keep = frac.slice(0, places);
  const rest = frac.slice(places);
  let up = false;
  if (rest.length) {
    if (rest[0] > "5") up = true;
    else if (rest[0] === "5") {
      const tie = /^50*$/.test(rest);
      const last = Number((places ? keep : int).slice(-1));
      up = !tie || last % 2 === 1;
    }
  }
  let all = (int + keep).split("").map(Number);
  if (up) {
    let i = all.length - 1;
    while (i >= 0) {
      if (all[i] === 9) { all[i] = 0; i--; } else { all[i]++; break; }
    }
    if (i < 0) all = [1, ...all];
  }
  const s = all.join("");
  const head = s.slice(0, s.length - places) || "0";
  return places ? `${head}.${s.slice(s.length - places)}` : head;
}

// f"{x:.Nf}"
export function pyFixed(x, places) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(n);
  const neg = n < 0 || Object.is(n, -0);
  const out = roundDecimalString(Math.abs(n).toFixed(100), places);
  return neg && /[1-9]/.test(out) ? `-${out}` : out;
}

// f"{x:g}": 6 significant digits, trailing zeros dropped, exponent form outside 1e-4 .. 1e6
export function pyG(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return n > 0 ? "inf" : n < 0 ? "-inf" : "nan";
  if (n === 0) return Object.is(n, -0) ? "-0" : "0";
  const [digits, e] = Math.abs(n).toExponential(20).split("e");
  let mantissa = roundDecimalString(digits, 5);
  let exp = Number(e);
  if (mantissa.startsWith("10")) { mantissa = "1.00000"; exp += 1; } // 9.999995 rounds up to 10
  const sign = n < 0 ? "-" : "";
  if (exp < -4 || exp >= 6) {
    return `${sign}${mantissa.replace(/\.?0+$/, "")}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const out = pyFixed(Math.abs(n), Math.max(0, 5 - exp));
  return sign + (out.includes(".") ? out.replace(/\.?0+$/, "") : out);
}

// json.dumps(value, ensure_ascii=False): ", " and ": " separators, non-ASCII kept as is
export function pyDumps(value) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : value > 0 ? "Infinity" : value < 0 ? "-Infinity" : "NaN";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyDumps).join(", ")}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}: ${pyDumps(v)}`).join(", ")}}`;
}

// ---- Templates ----------------------------------------------------------------------------------------------
export function loadTemplate(name) {
  const text = TEMPLATES[name];
  if (typeof text !== "string") throw new Error(`no prompt template ${name}`);
  const parts = text.split(new RegExp(MARKER.source, "m"));
  const found = {};
  for (let i = 1; i < parts.length; i += 2) found[parts[i]] = parts[i + 1];
  const keys = Object.keys(found).sort();
  if (keys.join(",") !== "system,user") throw new Error(`prompts/${name}.md needs one system and one user marker, found ${keys}`);
  return { system: found.system.replace(COMMENT, "").trim(), user: found.user.replace(COMMENT, "").trim() };
}

// Replace every {{name}}; a placeholder with no value is an error, so no prompt goes out half filled
export function fill(text, values) {
  const missing = [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].filter((k) => !(k in values)).sort();
  if (missing.length) throw new Error(`no value for placeholders ${missing.join(", ")}`);
  const out = text.replace(PLACEHOLDER, (_, k) => String(values[k]));
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function render(name, values) {
  const t = loadTemplate(name);
  return { system: fill(t.system, values), user: fill(t.user, values) };
}

export const defaultProfile = () => JSON.parse(JSON.stringify(DEFAULT_PROFILE));

// ---- Kitchen Profile ----------------------------------------------------------------------------------------
const number = (v) => (typeof v === "number" && !Number.isInteger(v) ? pyG(v) : String(v));

// One profile field as prompt text, or null when the user left it empty
export function fieldLine(field) {
  const value = field.value;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (field.type === "text") return String(value).trim() || null;
  const shown = field.type === "list"
    ? value.map((v) => String(v).trim()).filter(Boolean).join(", ")
    : number(value);
  if (!shown) return null;
  return (field.line ?? "{value}").split("{value}").join(shown);
}

// Kitchen Profile JSON -> the text the agents read. Sections with no lines left are skipped.
export function renderProfile(profile) {
  const p = profile || DEFAULT_PROFILE;
  const blocks = [];
  for (const section of p.sections) {
    const lines = section.fields.map(fieldLine).filter(Boolean);
    if (!lines.length) continue;
    blocks.push(section.plain ? lines.join("\n") : `${section.label}:\n${lines.map((l) => `- ${l}`).join("\n")}`);
  }
  return blocks.join("\n\n");
}

// ---- Request parts ------------------------------------------------------------------------------------------
const get = (form, key, fallback = null) => (form?.[key] === null || form?.[key] === undefined ? fallback : form[key]);
const truthy = (v) => !(v === null || v === undefined || v === 0 || v === "" || v === false || (Array.isArray(v) && !v.length));

// OK ranges per serving, the same rule as macro_check in smartbite_engine/meal.py, rounded inward so a number in
// the range passes: kcal within 10% of the target, protein 90% to 120%
export function targetRanges(form) {
  const kcal = get(form, "kcal_target", 450);
  const protein = get(form, "protein_g_target", 45);
  return { kcal: [Math.ceil(kcal * 0.9 - EPS), Math.floor(kcal * 1.1 + EPS)],
    protein_g: [Math.ceil(protein * 0.9 - EPS), Math.floor(protein * 1.2 + EPS)] };
}

// The Make Your Meal form as short lines
export function formText(form) {
  const servings = get(form, "servings");
  const ranges = targetRanges(form);
  const lines = [`Craving: ${get(form, "craving")}`, `Servings: ${servings}`,
    `Targets per serving: ${pyFixed(get(form, "kcal_target", 450), 0)} kcal (OK from ${ranges.kcal[0]} to ` +
    `${ranges.kcal[1]}), ${pyFixed(get(form, "protein_g_target", 45), 0)} g protein (OK from ` +
    `${ranges.protein_g[0]} to ${ranges.protein_g[1]} g)`];
  if (truthy(get(form, "carbs_g_max"))) lines.push(`Carbs max per serving: ${pyFixed(get(form, "carbs_g_max"), 0)} g`);
  if (truthy(get(form, "fat_g_max"))) lines.push(`Fat max per serving: ${pyFixed(get(form, "fat_g_max"), 0)} g`);
  const budget = get(form, "budget_total_eur");
  if (truthy(budget)) {
    lines.push(`Budget: ${pyFixed(budget, 2)} EUR total for all ${servings} servings ` +
      `(${pyFixed(budget / servings, 2)} EUR per serving), counted on whole packs bought`);
  }
  if (truthy(get(form, "exclude"))) lines.push(`Foods I do NOT want: ${get(form, "exclude").join(", ")}`);
  if (truthy(get(form, "time_limit_min"))) lines.push(`Time limit: ${get(form, "time_limit_min")} min`);
  if (truthy(get(form, "gear"))) lines.push(`Cooking gear: ${get(form, "gear").map((g) => GEAR_WORDS[g] || g).join(", ")}`);
  lines.push(`Reheat at work: ${get(form, "reheat_at_work", false) ? "yes" : "no"}`);
  lines.push(`Keep leftovers low: ${get(form, "keep_leftovers_low", true) ? "yes" : "no"}`);
  return lines.join("\n");
}

export function inspirationText(dishes) {
  if (!dishes?.length) return "(none picked: use real dishes you know)";
  return dishes.map((d) => `- ${d.name} (${d.cuisine}, ${d.style}): ${d.core.map(english).join(", ")}. ${d.method}`).join("\n");
}

// Known food names in English, each once, in the order given
export const knownText = (names) => (names?.length ? [...new Set(names.map(english))].join(", ") : NO_KNOWN);

const pyStr = (v) => (v === null || v === undefined ? "None" : String(v));

// Hints as text lines, or {ingredient, pack_grams, sold_by} objects from the generic pack options
export function packHintsText(hints) {
  const lines = (hints || []).map((h) => {
    if (typeof h === "string") return `- ${h}`;
    const food = english(h.ingredient);
    if (h.sold_by === "per_kg") return `- ${food}: loose, sold per ${pyG(h.pack_grams || 1000)} g`;
    if (h.sold_by === "per_unit") return `- ${food}: pack of ${pyStr(h.units_per_pack)} units`;
    return `- ${food}: ${pyG(h.pack_grams)} g pack`;
  });
  return lines.join("\n") || "(none known: pick usual portions)";
}

// Pack hints for the recipe prompt, for these foods only (the picked idea's main_ingredients, plus the foods of the
// last recipe on a rerun): one per food key with a typical pack size (data/open/packs/packs.json, slim copy in
// generated/), sorted by key, in the dict shape packHintsText reads. Same as pack_hints_for in Python.
export function typicalPackHints(names = [], packs = PACK_SIZES) {
  const found = new Map();
  for (const name of names || []) {
    const n = String(name);
    const key = Object.hasOwn(packs, n) ? n : Object.hasOwn(packs, canonical(n) ?? "") ? canonical(n) : null;
    if (key) found.set(key, packs[key]);
  }
  const keys = [...found.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // code point order, like Python
  return keys.map((food) => ({ ingredient: food, sold_by: packs[food].sold_by,
    pack_grams: packs[food].default_grams ?? null, units_per_pack: packs[food].units_per_pack ?? null }));
}

// The 15% cap on increases, per bought (non-pantry) ingredient of the first recipe. Eggs in units.
export function gramLimits(firstRecipe) {
  return (firstRecipe?.ingredients || []).filter((i) => !i.pantry).map((i) => {
    const units = i.units_per_serving || 0;
    if (units > 0) return { name: i.name, first_units: units, max_units: Math.floor(units * (1 + INCREASE_CAP) * 10 + EPS) / 10 };
    return { name: i.name, first_grams: i.grams_per_serving, max_grams: Math.floor(i.grams_per_serving * (1 + INCREASE_CAP) + EPS) };
  });
}

// What the rerun block needs, from an evaluated recipe (the /api/evaluate reply): the last recipe, macros per serving
// and per ingredient computed in code, the change requests, unknown foods and the gram limits from the first recipe
export function rerunInfo(meal, firstRecipe, attempt, maxAttempts = MAX_ATTEMPTS) {
  const ev = meal.evaluation;
  const servings = meal.form?.servings || meal.recipe.servings;
  const macros = ev.macros;
  const lines = (macros.lines || []).map((l) => ({ name: l.name, grams: l.grams / servings,
    ...Object.fromEntries(MACRO_FIELDS.map((k) => [k, (l.amount?.[k] || 0) / servings])) }));
  return { attempt, max_attempts: maxAttempts, previous: meal.recipe,
    per_serving: Object.fromEntries(MACRO_FIELDS.map((k) => [k, macros.per_serving?.[k] || 0])), lines,
    misses: [...(macros.misses || [])], change_requests: [...(ev.change_requests || [])],
    unresolved: [...(macros.unresolved || [])], limits: gramLimits(firstRecipe) };
}

const macroLine = (m, places = 0) => `${pyFixed(m.kcal, 0)} kcal, ${pyFixed(m.protein_g, places)} g protein, ` +
  `${pyFixed(m.carbs_g, places)} g carbs, ${pyFixed(m.fat_g, places)} g fat`;

// RERUN block for the user part: attempt, the last recipe, macros computed in code, the problems found and the gram
// limits. Empty on the first try (rerun null).
export function retryText(rerun, form = null) {
  if (!rerun) return "";
  const out = [`\nRERUN: attempt ${rerun.attempt} of ${rerun.max_attempts}. Code computed packs and macros from ` +
    "your last recipe and found problems. Fix them and return the full corrected recipe.",
  "", "YOUR PREVIOUS RECIPE:", pyDumps(rerun.previous)];
  if (rerun.per_serving) {
    out.push("", "MACROS PER SERVING, COMPUTED IN CODE:");
    for (const l of rerun.lines || []) out.push(`- ${l.name}, ${pyFixed(l.grams, 0)} g: ${macroLine(l)}`);
    out.push(`Total: ${macroLine(rerun.per_serving, 1)}`);
    if (form) {
      const r = targetRanges(form);
      const ok = [`kcal ${r.kcal[0]} to ${r.kcal[1]}`, `protein ${r.protein_g[0]} to ${r.protein_g[1]} g`];
      if (truthy(get(form, "carbs_g_max"))) ok.push(`carbs at most ${pyFixed(get(form, "carbs_g_max"), 0)} g`);
      if (truthy(get(form, "fat_g_max"))) ok.push(`fat at most ${pyFixed(get(form, "fat_g_max"), 0)} g`);
      out.push(`OK ranges: ${ok.join(", ")}`);
    }
  }
  if (rerun.unresolved?.length) {
    out.push(`Unknown foods, left out of the totals (use a name from KNOWN INGREDIENTS): ${rerun.unresolved.join(", ")}`);
  }
  out.push("", "PROBLEMS TO FIX:");
  const problems = (rerun.change_requests || []).map((r) =>
    `- ${r.reason} (${r.ingredient || "meal"}): ${r.hint ?? ""}`.replace(/[: ]+$/, ""));
  out.push(...(problems.length ? problems : ["- (none listed)"]));
  if (rerun.limits?.length) {
    out.push("", "GRAM LIMITS (per serving, at most 15% over the first recipe; cuts are fine):");
    for (const l of rerun.limits) {
      out.push("max_units" in l
        ? `- ${l.name}: at most ${pyG(l.max_units)} eggs (first recipe ${pyG(l.first_units)})`
        : `- ${l.name}: at most ${pyG(l.max_grams)} g (first recipe ${pyG(l.first_grams)} g)`);
    }
  }
  return out.join("\n") + "\n";
}

export function ideaPrompt(form, { profile = null, inspiration = [], knownIngredients = [] } = {}) {
  return render("idea", { kitchen_profile: renderProfile(profile), form: formText(form),
    inspiration: inspirationText(inspiration), known_ingredients: knownText(knownIngredients) });
}

export function revisionPrompt(form, idea, changes, { profile = null, knownIngredients = [] } = {}) {
  return render("revision", { kitchen_profile: renderProfile(profile), form: formText(form), idea: pyDumps(idea),
    changes: String(changes).trim(), known_ingredients: knownText(knownIngredients) });
}

// rerun: null on the first try, else rerunInfo(...) for the RERUN block
export function recipePrompt(form, idea, { profile = null, knownIngredients = [], packHints = [], rerun = null } = {}) {
  return render("recipe", { kitchen_profile: renderProfile(profile), form: formText(form), idea: pyDumps(idea),
    known_ingredients: knownText(knownIngredients), pack_hints: packHintsText(packHints),
    retry: retryText(rerun, form), servings: get(form, "servings") });
}

// Recipe import: the pasted recipe text as given (only trimmed), the known food names (import.schema.json Output)
export function importPrompt(paste, { knownIngredients = [] } = {}) {
  return render("import", { known_ingredients: knownText(knownIngredients), paste: String(paste).trim() });
}
