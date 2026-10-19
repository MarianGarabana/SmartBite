// Dish picker: the JS port (lib/inspiration.js) must pick the same dishes as smartbite_engine/inspiration.py for the
// same seed. The parity cases run the Python engine from the repo's .venv; they are skipped when it is not there.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DISHES } from "../generated/index.js";
import { COUNT, FIELDS, hasFood, numbers, pickDishes, seedNumber, shuffled } from "../lib/inspiration.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");
const hasPython = fs.existsSync(PYTHON);

// [craving, exclude, seed, count]
const CASES = [
  ["algo con salmón al horno", [], "r1", 12],
  ["chicken with eggs and onion", ["pollo", "cebolla"], "request-7", 12],
  ["sopa de lentejas", ["huevos", "pimiento rojo", "feta"], 42, 80],
];

test("same shuffle numbers as smartbite_engine/inspiration.py (values pinned on both sides)", () => {
  assert.equal(seedNumber("r1"), 206831020);
  assert.equal(seedNumber("señal"), 1282202828);
  const draw = numbers("r1");
  assert.deepEqual([1, 2, 3, 4].map(() => draw.next().value), [1558469944, 3941382763, 2834726580, 1134923905]);
  const ten = [...Array(10).keys()];
  assert.deepEqual(shuffled(ten, "r1"), [6, 2, 5, 0, 8, 7, 3, 9, 1, 4]);
  assert.deepEqual(shuffled(ten, 42), [3, 8, 2, 6, 4, 7, 0, 5, 9, 1]);
  assert.deepEqual(ten, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "the input is left alone");
});

test("same dishes as smartbite_engine/inspiration.py for the same seed, 3 cases", { skip: !hasPython && "no .venv/bin/python" }, () => {
  const run = spawnSync(PYTHON, ["-c", "import json,sys\nfrom smartbite_engine.inspiration import pick_dishes\n" +
    "print(json.dumps([pick_dishes(c, e, seed=s, count=n) for c, e, s, n in json.load(sys.stdin)], ensure_ascii=False))"],
  { cwd: ROOT, input: JSON.stringify(CASES), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const py = JSON.parse(run.stdout);
  CASES.forEach(([craving, exclude, seed, count], i) => {
    const js = pickDishes(craving, exclude, { seed, count });
    assert.ok(js.length > 0, `case ${i + 1} picks dishes`);
    assert.deepEqual(js, py[i], `case ${i + 1}: ${craving}`);
  });
});

test("12 dishes with the prompt fields; craving matches first, in Spanish too", () => {
  const picked = pickDishes("algo con salmón", [], { seed: "r1" });
  assert.equal(picked.length, COUNT);
  assert.ok(picked.every((d) => Object.keys(d).join() === FIELDS.join()));
  const salmon = DISHES.filter((d) => d.core.includes("salmon")).map((d) => d.name).sort();
  assert.deepEqual(picked.slice(0, salmon.length).map((d) => d.name).sort(), salmon);
  assert.ok(pickDishes("sopa de lentejas", [], { seed: "r1" })[0].core.includes("dried lentils"));
});

test("no dish with an excluded food, Spanish or English; same seed same pick", () => {
  for (const exclude of [["huevos"], ["eggs"], ["pollo", "cebolla"], ["chicken", "onion"]]) {
    const picked = pickDishes("chicken with eggs and onion", exclude, { seed: "r2", count: 80 });
    assert.ok(picked.length);
    assert.ok(!picked.some((d) => hasFood(d, exclude)), exclude.join());
  }
  const names = pickDishes("tortilla", ["eggs"], { seed: "r2", count: 80 }).map((d) => d.name);
  assert.ok(!names.includes("Tortilla de patatas") && !names.includes("Shakshuka"));
  assert.deepEqual(pickDishes("bowl", [], { seed: "request-1" }), pickDishes("bowl", [], { seed: "request-1" }));
  assert.notDeepEqual(pickDishes("zzz", [], { seed: "request-1" }).map((d) => d.name),
    pickDishes("zzz", [], { seed: "request-2" }).map((d) => d.name));
  assert.throws(() => pickDishes("bowl", []), /needs a seed/);
});
