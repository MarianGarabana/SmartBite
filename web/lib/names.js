// One name per food: canonical(name) gives the English key used in the data files, or null. JS port of
// smartbite_engine/names.py, reading data/open/aliases.json (copied to generated/ before build). Matching ignores
// case, accents, extra spaces and simple plurals ("Pechugas de pollo" -> "chicken breast").
import { ALIASES } from "../generated/index.js";

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "en", "al", "a", "con", "y", "o", "para", "sin", "un", "una",
  "lata", "the", "and", "or", "with", "of", "in", "for", "on", "an", "some", "no"]);

// Lowercase, no accents, single spaces
export function plain(text) {
  const t = String(text || "").toLowerCase().normalize("NFKD").replace(/\p{Mn}/gu, "");
  return t.split(/\s+/).filter(Boolean).join(" ");
}

// Plural dropped: "huevos" -> "huevo", "eggs" -> "egg", "champinones" -> "champinon", "tomatoes" -> "tomato"
export function singular(word) {
  const n = word.length;
  if (n > 4 && word.endsWith("es") && "nrld".includes(word[n - 3]) && "aeiou".includes(word[n - 4])) return word.slice(0, -2);
  if (n > 4 && word.endsWith("oes")) return word.slice(0, -2);
  return n > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

// Content words of a text, stopwords left out
export const words = (text) => (plain(text).match(/[a-z0-9]+/g) || []).filter((w) => !STOPWORDS.has(w));

// Set of singular content words, for word-level matching (cravings, exclusions, kept main foods)
export const stems = (text) => new Set(words(text).map(singular));

const form = (text) => plain(text).replace(/\s+%/g, "%"); // "0 %" and "0%" are the same name
const singularPhrase = (text) => form(text).split(/\s+/).filter(Boolean).map(singular).join(" ");

const cache = new Map();
function load(data) {
  if (cache.has(data)) return cache.get(data);
  const exact = new Map();
  for (const [f, key] of [...(data.foods || []).map((f) => [form(f), f]), ...Object.entries(data.aliases || {}).map(([k, v]) => [form(k), v])]) {
    if (!exact.has(f)) exact.set(f, key);
  }
  const loose = new Map();
  for (const [f, key] of exact) {
    const s = singularPhrase(f);
    if (!loose.has(s)) loose.set(s, new Set());
    loose.get(s).add(key);
  }
  const aliases = new Map(Object.entries(data.aliases || {}).map(([k, v]) => [form(k), v])); // later wins, like a dict
  const out = { exact, loose, aliases };
  cache.set(data, out);
  return out;
}

// English key for a food name, or null when the food is unknown
export function canonical(name, data = ALIASES) {
  const { exact, loose } = load(data);
  const f = form(name);
  if (exact.has(f)) return exact.get(f);
  const keys = loose.get(singularPhrase(f));
  return keys && keys.size === 1 ? [...keys][0] : null;
}

// The food's English key when it is a known food, else the name as given
export const english = (name) => canonical(name) || name;

// Every English food key, sorted
export const foods = (data = ALIASES) => [...(data.foods || [])].sort();

// Other names of one English key (plain forms), sorted
export function aliasesOf(key, data = ALIASES) {
  return [...load(data).aliases].filter(([, k]) => k === key).map(([a]) => a).sort();
}
