// Grams for foods counted in pieces ("4 large potatoes", "3 cloves garlic"). JS port of smartbite_engine/pieces.py
// (decided 2026-11-10): the import model returns the count and size word of a piece line, and code weighs it with
// data/open/piece-weights.json (USDA SR Legacy), copied into generated/ at build. A food not in the table, or a line
// that names a cup, spoon, weight or container, keeps the model's grams. test/pieces.test.mjs checks parity with Python.
import { PIECE_WEIGHTS } from "../generated/index.js";

const SCALE = { small: 0.6, medium: 1.0, large: 1.5 };
const COUNT_START = /^\s*(?:[-*•·]\s*)?(?:\d|[½¼¾⅓⅔⅛])/;
// Python's \b is Unicode-aware; JS's is ASCII only, so "puñados" needs explicit edges: no letter before or after
const L = "A-Za-zÀ-ÖØ-öø-ÿ";
const NOT_PIECES = new RegExp(`(?<![${L}0-9_])(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|kilos?|ml|cl|l|` +
  "litres?|liters?|oz|ounces?|lbs?|pounds?|fl|cans?|tins?|jars?|bunch(?:es)?|slices?|pinch(?:es)?|handfuls?|dash(?:es)?|" +
  "tazas?|cucharadas?|cucharaditas?|gramos?|kilogramos?|litros?|mililitros?|latas?|botes?|tarros?|manojos?|" +
  `rodajas?|lonchas?|pizcas?|vasos?|puñados?|chorritos?)(?![${L}0-9_])`, "i");

let byName = null;
function table() {
  if (!byName) {
    byName = new Map();
    for (const [name, entry] of Object.entries(PIECE_WEIGHTS)) {
      for (const n of [name, ...(entry.aliases || [])]) byName.set(n.toLowerCase(), entry);
    }
  }
  return byName;
}

// Python round(x, 1) on the products used here (counts with at most one decimal times whole or .x grams)
const round1 = (x) => Math.round(x * 10 + Number.EPSILON * Math.sign(x)) / 10;

// Grams of count pieces of this food at this size, or null when the food is not in the table
export function pieceGrams(name, count, size = "medium") {
  const entry = table().get(String(name || "").trim().toLowerCase());
  if (!entry || !(size in SCALE)) return null;
  const one = size in entry.grams ? entry.grams[size] : entry.grams.medium * SCALE[size];
  return round1(count * one);
}

// True when an ingredient line counts whole pieces ("4 large potatoes", "* 1 tallo de porro")
export const countsPieces = (line) => COUNT_START.test(line || "") && !NOT_PIECES.test(line || "");

// A copy of an import reply where every ingredient with "pieces" of a table food, on a line that counts pieces, gets
// its grams from the table (marked grams_from: "pieces"). Other ingredients are unchanged.
export function applyPieces(reply) {
  return { ...reply, ingredients: (reply.ingredients || []).map((ing) => {
    const p = ing.pieces;
    const grams = p && countsPieces(ing.line) ? pieceGrams(ing.name, p.count, p.size) : null;
    return grams ? { ...ing, grams_total: grams, grams_from: "pieces" } : { ...ing };
  }) };
}
