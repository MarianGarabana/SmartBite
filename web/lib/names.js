// One name per food: canonical(name) gives the English key used in the data files, or null. JS port of
// smartbite_engine/names.py, reading data/open/aliases.json (copied to generated/ before build). Matching ignores
// case, accents, extra spaces and simple plurals ("Pechugas de pollo" -> "chicken breast"). Keys are the prompt's
// food list ("foods") and the foods for names only ("more_foods"); a name no alias matches can still count as a food
// through "word_rules" ("pork chops" -> "pork loin"), and match() says when that happened.
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
  const every = [...(data.foods || []), ...(data.more_foods || [])];
  const named = Object.entries({ ...(data.aliases || {}), ...(data.more_aliases || {}) });
  for (const [f, key] of [...every.map((f) => [form(f), f]), ...named.map(([k, v]) => [form(k), v])]) {
    if (!exact.has(f)) exact.set(f, key);
  }
  const loose = new Map();
  for (const [f, key] of exact) {
    const s = singularPhrase(f);
    if (!loose.has(s)) loose.set(s, new Set());
    loose.get(s).add(key);
  }
  // "aliases" only, not "more_aliases": aliasesOf feeds the dish picks for the Idea prompt (same until an eval run)
  const aliases = new Map(Object.entries(data.aliases || {}).map(([k, v]) => [form(k), v])); // later wins, like a dict
  const spec = data.word_rules || {};
  const sing = (ws) => new Set((ws || []).map(singular));
  const rules = (spec.rules || []).map((r) => ({ words: sing(r.words), food: r.food, head: r.head || null, unless: sing(r.unless) }));
  const out = { exact, loose, aliases, rules, split: new Set(spec.split_words || []), stop: sing(spec.stop_words),
    frozen: sing(spec.frozen_words) };
  cache.set(data, out);
  return out;
}

// Food of the first word rule that fits the name, or null (see "word_rules" in aliases.json). The name is read up to
// the first split word, so "sardinas en aceite" is about sardines, not oil; a rule's unless words count in the whole
// name ("frozen chicken in sauce" is not plain chicken). A rule with no food ("pork fat") stops.
function byRule(f, { rules, split, stop, frozen: frozenWords }) {
  const tokens = f.match(/[a-z0-9]+/g) || [];
  const every = new Set(tokens.filter((w) => !STOPWORDS.has(w)).map(singular));
  const main = [];
  for (const token of tokens) {
    if (split.has(token)) break;
    main.push(token);
  }
  const ws = main.filter((w) => !STOPWORDS.has(w)).map(singular);
  if (!ws.length) return null;
  const have = new Set(ws);
  const ends = [ws[0], ws[ws.length - 1]];
  const frozen = ws.some((w) => frozenWords.has(w));
  for (const rule of rules) {
    if (![...rule.words].every((w) => have.has(w)) || [...every].some((w) => rule.unless.has(w))) continue;
    if (ends.some((w) => stop.has(w) && !rule.words.has(w))) continue;
    if (rule.food == null) return null;
    if (frozen !== rule.food.includes("frozen")) continue; // fresh names never count as frozen foods, nor the other way
    if (rule.head && !rule.words.has(rule.head === "first" ? ws[0] : ws[ws.length - 1])) continue;
    return rule.food;
  }
  return null;
}

// [English key, byRule] for a food name: byRule is true when no name of the food matched and a word rule picked the
// closest food ("pork chops" -> ["pork loin", true]). [null, false] when the food is unknown.
export function match(name, data = ALIASES) {
  const index = load(data);
  const f = form(name);
  if (index.exact.has(f)) return [index.exact.get(f), false];
  const keys = index.loose.get(singularPhrase(f));
  if (keys && keys.size === 1) return [[...keys][0], false];
  const key = byRule(f, index);
  return [key, key != null];
}

// English key for a food name, or null when the food is unknown
export const canonical = (name, data = ALIASES) => match(name, data)[0];

// The food's English key when it is a known food, else the name as given
export const english = (name) => canonical(name) || name;

// English food keys of the AI prompt's food list (KNOWN INGREDIENTS), sorted
export const foods = (data = ALIASES) => [...(data.foods || [])].sort();

// Every English food key the engine knows: the prompt's food list and "more_foods", sorted
export const allFoods = (data = ALIASES) => [...(data.foods || []), ...(data.more_foods || [])].sort();

// Other names of one English key (plain forms), sorted
export function aliasesOf(key, data = ALIASES) {
  return [...load(data).aliases].filter(([, k]) => k === key).map(([a]) => a).sort();
}
