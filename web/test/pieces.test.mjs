// Piece weights for the recipe import: lib/pieces.js must give the same grams and the same piece-line verdicts as
// smartbite_engine/pieces.py. The parity case runs the Python engine from the repo's .venv; skipped without it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyPieces, countsPieces, pieceGrams } from "../lib/pieces.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");

const LINES = ["4 patatas grandes", "* 4 huevos grandes", "½ yellow onion", "1-2 stalks celery, chopped", "1 tallo de porro",
  "2 dientes de ajo", "1/2 cup carrot, shredded", "1 large can (12 oz) tuna", "Juice of ½ lemon", "1 bunch of fresh asparagus",
  "2 cucharadas de aceite", "Season with 2 onions", "2 puñados de espinacas", "1 l de caldo", "3 Tbsp olive oil",
  "1 cebolla grande", "10 1/2 oz (298 g) beef broth", "- 2 zanahorias medianas", "1 lata de atún", "6 ripe tomatoes diced"];
const WEIGHS = [["potato", 4, "large"], ["Onion", 0.5, "medium"], ["garlic", 6, "medium"], ["celery", 1.5, "medium"],
  ["chile pepper", 1, "medium"], ["garlic", 2, "large"], ["lemon", 3, "small"], ["chorizo", 1, "medium"],
  ["onion", 1, "huge"], ["spring onion", 1, "medium"], ["tomato", 0.3, "small"], ["carrot", 2.5, "large"]];

test("pieces: USDA sizes, scaled sizes, aliases and foods outside the table", () => {
  assert.equal(pieceGrams("potato", 4, "large"), 1476);
  assert.equal(pieceGrams("garlic", 2, "large"), 9);
  assert.equal(pieceGrams("chile pepper", 1), 45);
  assert.equal(pieceGrams("chorizo", 1), null);
  assert.equal(pieceGrams("spring onion", 1), null);
  assert.equal(countsPieces("2 puñados de espinacas"), false);
  const out = applyPieces({ ingredients: [
    { line: "4 patatas grandes", name: "potato", grams_total: 800, pieces: { count: 4, size: "large" } },
    { line: "1/2 cup carrot", name: "carrot", grams_total: 55, pieces: { count: 1, size: "small" } }] });
  assert.deepEqual(out.ingredients.map((i) => [i.grams_total, i.grams_from]), [[1476, "pieces"], [55, undefined]]);
});

test("pieces: same grams and piece lines as smartbite_engine/pieces.py", { skip: !fs.existsSync(PYTHON) && "no .venv/bin/python" }, () => {
  const py = "import json,sys\nfrom smartbite_engine.pieces import counts_pieces, piece_grams\nd=json.load(sys.stdin)\n" +
    "print(json.dumps({'lines': [counts_pieces(l) for l in d['lines']], 'grams': [piece_grams(*w) for w in d['weighs']]}))";
  const run = spawnSync(PYTHON, ["-c", py], { cwd: ROOT, input: JSON.stringify({ lines: LINES, weighs: WEIGHS }), encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  const want = JSON.parse(run.stdout);
  assert.deepEqual(LINES.map(countsPieces), want.lines);
  assert.deepEqual(WEIGHS.map((w) => pieceGrams(...w)), want.grams);
});
