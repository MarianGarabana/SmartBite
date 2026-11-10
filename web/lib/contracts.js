// Model replies checked against docs/contracts in JS: the subset the browser needs (idea, revision and recipe
// Output), same rules and messages as smartbite_engine/contracts.py. The schemas below are copied from
// docs/contracts/*.schema.json without descriptions and defaults; test/contracts.test.mjs fails if they drift.
// Supported keywords: type, required, properties, additionalProperties (false), items, enum, minimum,
// exclusiveMinimum, maximum, minItems, maxItems, maxLength, $ref.
import { canonical, stems } from "./names.js";

const MACROS = {
  type: "object",
  required: ["kcal", "protein_g", "carbs_g", "fat_g"],
  properties: {
    kcal: { type: "number", minimum: 0 },
    protein_g: { type: "number", minimum: 0 },
    carbs_g: { type: "number", minimum: 0 },
    fat_g: { type: "number", minimum: 0 },
  },
  additionalProperties: false,
};

const IDEA = {
  type: "object",
  required: ["idea_id", "name", "one_line", "main_ingredients", "rough_macros", "image_prompt"],
  properties: {
    idea_id: { type: "string" },
    name: { type: "string", maxLength: 60 },
    one_line: { type: "string", maxLength: 140 },
    main_ingredients: { type: "array", minItems: 2, maxItems: 8, items: { type: "string", maxLength: 60 } },
    rough_macros: { $ref: "common.schema.json#/$defs/Macros" },
    image_prompt: { type: "string" },
    changes: { type: "string" },
  },
  additionalProperties: false,
};

const INGREDIENT = {
  type: "object",
  required: ["name", "grams_per_serving", "units_per_serving", "storage", "pantry", "dry"],
  properties: {
    name: { type: "string", maxLength: 60 },
    grams_per_serving: { type: "number", exclusiveMinimum: 0 },
    units_per_serving: { type: "number", minimum: 0 },
    storage: { enum: ["fresh", "keeps", "frozen"] },
    pantry: { type: "boolean" },
    dry: { type: "boolean" },
    note: { type: "string", maxLength: 80 },
    leftover_plan: { enum: ["use_in_another_meal"] },
  },
  additionalProperties: false,
};

export const SCHEMAS = {
  "common.schema.json": { $defs: { Macros: MACROS } },
  "idea.schema.json": {
    $defs: {
      Output: {
        type: "object",
        required: ["ideas"],
        properties: { ideas: { type: "array", minItems: 4, maxItems: 4, items: { $ref: "#/$defs/Idea" } } },
        additionalProperties: false,
      },
      Idea: IDEA,
    },
  },
  "revision.schema.json": {
    $defs: {
      Output: {
        type: "object",
        required: ["idea"],
        properties: { idea: { $ref: "idea.schema.json#/$defs/Idea" } },
        additionalProperties: false,
      },
    },
  },
  "recipe.schema.json": {
    $defs: {
      Output: {
        type: "object",
        required: ["title", "servings", "prep_time_min", "ingredients", "steps"],
        properties: {
          idea_id: { type: "string" },
          title: { type: "string", maxLength: 100 },
          servings: { type: "integer", minimum: 1, maximum: 8 },
          prep_time_min: { type: "integer", minimum: 0 },
          ingredients: { type: "array", minItems: 1, items: { $ref: "#/$defs/Ingredient" } },
          steps: { type: "array", minItems: 1, items: { type: "string" } },
          note: { type: "string", maxLength: 200 },
        },
        additionalProperties: false,
      },
      Ingredient: INGREDIENT,
    },
  },
  // Recipe import (prompts/import.md): whole-recipe grams, servings only when the text states them
  "import.schema.json": {
    $defs: {
      Output: {
        type: "object",
        required: ["title", "servings", "prep_time_min", "ingredients", "steps"],
        properties: {
          title: { type: "string", maxLength: 100 },
          servings: { type: ["integer", "null"], minimum: 1, maximum: 50 },
          prep_time_min: { type: "integer", minimum: 0 },
          ingredients: { type: "array", minItems: 1, items: { $ref: "#/$defs/Ingredient" } },
          steps: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
      Ingredient: {
        type: "object",
        required: ["line", "name", "grams_total", "units_total", "guessed", "storage", "pantry", "dry"],
        properties: {
          line: { type: "string", maxLength: 400 },
          name: { type: "string", maxLength: 60 },
          grams_total: { type: "number", exclusiveMinimum: 0 },
          units_total: { type: "number", minimum: 0 },
          guessed: { type: "boolean" },
          storage: { enum: ["fresh", "keeps", "frozen"] },
          pantry: { type: "boolean" },
          dry: { type: "boolean" },
          note: { type: "string", maxLength: 80 },
          pieces: {
            type: "object", required: ["count", "size"],
            properties: { count: { type: "number", exclusiveMinimum: 0 }, size: { enum: ["small", "medium", "large"] } },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
};

// The reply must be one JSON object, optionally in a single ```json fence, with nothing else around it.
// Returns [data, errors].
export function parseReply(text) {
  let body = String(text ?? "").trim();
  const fence = body.match(/^```(?:json)?\s*\n([\s\S]*)\n\s*```$/);
  if (fence) body = fence[1].trim();
  try {
    return [JSON.parse(body), []];
  } catch (e) {
    const end = endOfFirstValue(body);
    if (end > 0) {
      try {
        const data = JSON.parse(body.slice(0, end));
        if (body.slice(end).trim()) {
          return [null, ["reply has extra text after the JSON. Reply with ONLY the JSON object, no notes or analysis."]];
        }
        return [data, []];
      } catch {}
    }
    return [null, [`reply is not valid JSON (${e.message}). Reply with ONLY the JSON object.`]];
  }
}

// Index just past the first top-level {...} or [...] in text, or -1
function endOfFirstValue(text) {
  if (text[0] !== "{" && text[0] !== "[") return -1;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function resolve(ref, currentFile) {
  const [file, pointer = ""] = ref.split("#");
  const name = file || currentFile;
  let doc = SCHEMAS[name];
  if (!doc) throw new Error(`no contract ${name}`);
  for (const part of pointer.replace(/^\/+|\/+$/g, "").split("/")) doc = doc[part];
  return [doc, name];
}

const kindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);

function isType(value, kind) {
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (kind === "integer") return Number.isInteger(value);
  if (kind === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (kind === "array") return Array.isArray(value);
  if (kind === "null") return value === null;
  return typeof value === kind;
}

export function validate(value, schema, fileName, path = "reply") {
  if (schema.$ref) {
    const [target, targetFile] = resolve(schema.$ref, fileName);
    return validate(value, target, targetFile, path);
  }
  const errors = [];
  if (schema.type) {
    const kinds = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!kinds.some((k) => isType(value, k))) return [`${path}: must be ${kinds.join(" or ")}, got ${kindOf(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  if (typeof value === "number") {
    if ("minimum" in schema && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if ("exclusiveMinimum" in schema && value <= schema.exclusiveMinimum) errors.push(`${path}: must be > ${schema.exclusiveMinimum}`);
    if ("maximum" in schema && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }
  if (typeof value === "string" && "maxLength" in schema && [...value].length > schema.maxLength) {
    errors.push(`${path}: at most ${schema.maxLength} characters, got ${[...value].length}`);
  }
  if (Array.isArray(value)) {
    if ("minItems" in schema && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} items, got ${value.length}`);
    if ("maxItems" in schema && value.length > schema.maxItems) errors.push(`${path}: at most ${schema.maxItems} items, got ${value.length}`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items, fileName, `${path}[${i}]`)));
  }
  if (isType(value, "object")) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}: missing required field ${key}`);
    const props = schema.properties || {};
    for (const [key, item] of Object.entries(value)) {
      if (key in props) errors.push(...validate(item, props[key], fileName, path !== "reply" ? `${path}.${key}` : key));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected field ${key}`);
    }
  }
  return errors;
}

// Errors for data against one $defs entry of a contract (Output by default). Empty list = valid.
export function validateOutput(data, contractFile, definition = "Output") {
  return validate(data, SCHEMAS[contractFile].$defs[definition], contractFile);
}

// Words of a food after canonical(): the English key's words when the food is known, else its own words
const baseWords = (name) => stems(canonical(name) || name);

// Main foods of the picked idea the recipe dropped: same rule as missing_main_foods in eval/checks.py. A food counts
// as kept when the stems of its first word are all in an ingredient name, both names are the same food (same
// English key, so "pechuga de pollo" keeps "chicken breast"), or an ingredient is a specific kind of it: every base
// word of the main food is in the ingredient's base words, so "basmati rice" keeps "rice" and "arroz".
export function missingMainFoods(idea, ingredients) {
  const items = (Array.isArray(ingredients) ? ingredients : []).filter((i) => i && typeof i === "object");
  const nameOf = (i) => String(i.name || "");
  const have = new Set(items.flatMap((i) => [...stems(nameOf(i))]));
  const keys = new Set(items.map((i) => canonical(nameOf(i))).filter(Boolean));
  const bases = items.map((i) => baseWords(nameOf(i)));
  return (idea?.main_ingredients || []).filter((f) => {
    const first = String(f).trim().split(/\s+/)[0] || String(f);
    const base = [...baseWords(String(f))];
    return [...stems(first)].some((w) => !have.has(w)) && !keys.has(canonical(f)) &&
      !bases.some((b) => base.every((w) => b.has(w)));
  });
}
