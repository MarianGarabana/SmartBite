"""Score a folder of stored replies against the golden cravings. No model calls, no headless Claude.

    .venv/bin/python -m eval.run score <run>
        reads eval/replies/<run>/<case id>.json, writes eval/results/<run>.md
    .venv/bin/python -m eval.run prompt <case id> --stage idea
    .venv/bin/python -m eval.run prompt <case id> --stage recipe --run <run>
    .venv/bin/python -m eval.run prompt <case id> --stage rerun --run <run> [--attempt N]
        prints the system and user prompt for one case, to hand to a Claude Code subagent by hand. The rerun prompt
        is built like the web app's loop (web/lib/flow.js): the stored recipe of attempt N - 1 is evaluated by
        smartbite_engine.meal.evaluate and its misses and change requests go into the RERUN block. N is 2 or 3;
        without --attempt it is the next one (2 + the number of stored reruns).

A reply file: {"ideas": <reply text or object>, "picked_idea_id": "1", "recipe": <reply text or object>,
"reruns": [<reply text or object>, ...]}. "reruns" is optional; scoring checks the last recipe and reports the
number of recipe attempts per case.
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

from smartbite_engine.contracts import validate_output
from smartbite_engine.inspiration import load_dishes, pick_dishes
from smartbite_engine.meal import evaluate
from smartbite_engine.prompts import (MAX_ATTEMPTS, idea_prompt, pack_hint_foods, pack_hints_for, recipe_prompt,
                                      rerun_info)

from .checks import (CHECKS, FAIL, NUTRITION, PASS, SKIP, _ingredients, check_case, check_macros, load_per_100g,
                     load_reply, recipe_replies)

EVAL = Path(__file__).resolve().parent
GOLDEN = EVAL / "golden.json"
REPLIES = EVAL / "replies"
RESULTS = EVAL / "results"
MARK = {PASS: "ok", FAIL: "FAIL", SKIP: "skip"}


def load_cases(path=GOLDEN):
    return json.loads(Path(path).read_text(encoding="utf-8"))["cases"]


def score(run, *, golden=GOLDEN, replies=REPLIES, results=RESULTS, nutrition=NUTRITION, today=None):
    """Check every golden case, write results/<run>.md, return the summary."""
    folder = Path(replies) / run
    if not folder.is_dir():
        raise FileNotFoundError(f"no reply folder {folder}")
    table = load_per_100g(nutrition)
    rows, missing, attempts, first_macros = [], [], {}, {PASS: 0, FAIL: 0, SKIP: 0}
    for case in load_cases(golden):
        path = folder / f"{case['id']}.json"
        if path.exists():
            reply = json.loads(path.read_text(encoding="utf-8"))
            checks = check_case(case, reply, table)
            recipes = recipe_replies(reply)
            attempts[case["id"]] = len(recipes)
            first, _ = load_reply(recipes[0])
            first_macros[check_macros(_ingredients(first), case["form"], table)["status"]] += 1
        else:
            missing.append(case["id"])
            checks = [{"check": c, "status": FAIL, "detail": "no reply file"} for c in CHECKS]
        rows.append((case, checks))
    counts = {c: {PASS: 0, FAIL: 0, SKIP: 0} for c in CHECKS}
    for _, checks in rows:
        for r in checks:
            counts[r["check"]][r["status"]] += 1
    passed = sum(c[PASS] for c in counts.values())
    failed = sum(c[FAIL] for c in counts.values())
    skipped = sum(c[SKIP] for c in counts.values())
    summary = {"run": run, "cases": len(rows), "passed": passed, "failed": failed, "skipped": skipped,
               "score": passed / (passed + failed) if passed + failed else 0.0, "missing": missing,
               "nutrition_table": table is not None, "counts": counts, "attempts": attempts,
               "first_macros": first_macros}
    out = Path(results) / f"{run}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_md(summary, rows, today or date.today().isoformat()), encoding="utf-8")
    summary["results"] = str(out)
    return summary


def render_md(summary, rows, today):
    lines = [f"# Eval run: {summary['run']}", "",
             f"Scored {today} from `eval/replies/{summary['run']}/` against `eval/golden.json`. Code checks only, no model calls.",
             "",
             f"Score: {summary['passed']}/{summary['passed'] + summary['failed']} checks passed "
             f"({100 * summary['score']:.1f}%). Skipped: {summary['skipped']}. "
             f"Cases with no reply file: {len(summary['missing'])}"
             + (f" ({', '.join(summary['missing'])})." if summary["missing"] else "."),
             ""]
    if not summary["nutrition_table"]:
        lines += ["Macro check skipped: no nutrition table at `data/open/nutrition/per-100g.json` yet.", ""]
    attempts = summary.get("attempts") or {}
    reran = [cid for cid, n in attempts.items() if n > 1]
    if attempts:
        first, last = summary["first_macros"], summary["counts"]["macros_vs_target"]
        lines += [f"Recipe attempts: {len(reran)} of {len(attempts)} cases have reruns "
                  f"({sum(n - 1 for n in attempts.values())} reruns in all). The recipe checks use the last recipe. "
                  f"macros_vs_target on the first recipe: {first[PASS]} pass, {first[FAIL]} fail, {first[SKIP]} skip; "
                  f"on the last: {last[PASS]} pass, {last[FAIL]} fail, {last[SKIP]} skip.", ""]
    lines += ["## Checks", "", "| Check | Pass | Fail | Skip |", "|---|---|---|---|"]
    lines += [f"| {c} | {n[PASS]} | {n[FAIL]} | {n[SKIP]} |" for c, n in summary["counts"].items()]
    lines += ["", "## Cases", "", "| Case | " + " | ".join(CHECKS) + " | attempts |", "|---" * (len(CHECKS) + 2) + "|"]
    for case, checks in rows:
        status = {r["check"]: MARK[r["status"]] for r in checks}
        lines.append(f"| {case['id']} | " + " | ".join(status[c] for c in CHECKS) +
                     f" | {attempts.get(case['id'], '-')} |")
    problems = [(case["id"], r) for case, checks in rows for r in checks if r["status"] != PASS and r["detail"]]
    lines += ["", "## Failures and skips", ""]
    lines += [f"- {cid}, {r['check']} ({r['status']}): {r['detail']}" for cid, r in problems] or ["None."]
    return "\n".join(lines) + "\n"


def known_ingredients(nutrition=NUTRITION):
    """Food names the agents should use: the nutrition table when it exists, else the inspiration foods."""
    table = load_per_100g(nutrition)
    if table:
        return sorted(table)
    return sorted({food for d in load_dishes() for food in d["core"]})


def _stored_recipe(value, label):
    recipe, errors = load_reply(value)
    errors = errors or validate_output(recipe, "recipe.schema.json")
    if errors:
        raise ValueError(f"stored {label} is not a valid recipe: {errors[:3]}")
    return recipe


def case_prompt(case_id, stage, run=None, *, attempt=None, golden=GOLDEN, replies=REPLIES, table=None, packs=None):
    """System and user prompt for one case. stage: idea, recipe or rerun (see the module doc). table, packs: the
    engine's nutrition and pack data for the rerun evaluation (default: data/open)."""
    case = next((c for c in load_cases(golden) if c["id"] == case_id), None)
    if case is None:
        raise LookupError(f"no golden case {case_id!r}")
    form, known = case["form"], known_ingredients()
    if stage == "idea":
        dishes = pick_dishes(form["craving"], form.get("exclude") or [], seed=case_id)
        return idea_prompt(form, inspiration=dishes, known_ingredients=known)
    if not run:
        raise ValueError(f"the {stage} prompt needs --run, to read the stored replies")
    reply = json.loads((Path(replies) / run / f"{case_id}.json").read_text(encoding="utf-8"))
    ideas, errors = load_reply(reply.get("ideas"))
    if errors:
        raise ValueError(f"stored ideas reply is not valid: {errors}")
    wanted = reply.get("picked_idea_id") or ideas["ideas"][0]["idea_id"]
    idea = next(i for i in ideas["ideas"] if i["idea_id"] == wanted)
    if stage == "recipe":
        return recipe_prompt(form, idea, known_ingredients=known, pack_hints=pack_hints_for(pack_hint_foods(idea), packs))
    if stage != "rerun":
        raise ValueError(f"unknown stage {stage!r}")
    stored = recipe_replies(reply)
    attempt = attempt or len(stored) + 1
    if not 2 <= attempt <= MAX_ATTEMPTS:
        raise ValueError(f"attempt must be 2 to {MAX_ATTEMPTS}, got {attempt}")
    if attempt - 1 > len(stored):
        raise ValueError(f"attempt {attempt} needs the recipe of attempt {attempt - 1}; the reply file has "
                         f"{len(stored)} recipe(s)")
    first = _stored_recipe(stored[0], "recipe")
    previous = _stored_recipe(stored[attempt - 2], "recipe" if attempt == 2 else f"reruns[{attempt - 3}]")
    meal = evaluate(form, idea, previous, table=table, packs=packs)
    rerun = rerun_info(meal, first, attempt)
    return recipe_prompt(form, idea, known_ingredients=known, pack_hints=pack_hints_for(pack_hint_foods(idea, rerun), packs),
                         rerun=rerun)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="eval.run")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("score")
    s.add_argument("run")
    p = sub.add_parser("prompt")
    p.add_argument("case")
    p.add_argument("--stage", choices=["idea", "recipe", "rerun"], default="idea")
    p.add_argument("--run")
    p.add_argument("--attempt", type=int, help="rerun stage: the attempt to write, 2 or 3 (default: the next one)")
    args = parser.parse_args(argv)
    if args.command == "score":
        summary = score(args.run)
        print(json.dumps({k: summary[k] for k in ("run", "cases", "passed", "failed", "skipped", "score",
                                                  "missing", "results")}, indent=1))
        return 0
    prompt = case_prompt(args.case, args.stage, args.run, attempt=args.attempt)
    sys.stdout.write(f"=== SYSTEM ===\n{prompt['system']}\n\n=== USER ===\n{prompt['user']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
