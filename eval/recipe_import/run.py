"""Paste-a-recipe import eval: the 10 golden pastes through a real model, then the code grader (grade.py).

    .venv/bin/python -m eval.recipe_import.run live --run <name> [--provider gemini|anthropic] [--model <id>] [--cases <ids>] [--max-usd 1.00]
        [--min-gap 6] [--dry-run] [--resume]
    .venv/bin/python -m eval.recipe_import.run score <name>

live: one call per case with prompts/import.md (the browser's prompt, same known food list); a reply that fails the
contract gets its errors back once, as askJson in web/lib/llm.js does. --provider gemini (default) or anthropic, with
the recipe call's settings (Gemini: default reasoning; Anthropic: effort medium), through eval.live's Runner: key from
.env only (never printed or written), spend guard per call
(worst case added to money spent; stop past --max-usd), `User-Agent: SmartBite`, at most 2 calls per case.
Writes eval/recipe_import/replies/<run>/<case>.json and then scores the run. --resume runs again only the cases of
that run whose call failed on the provider side (HTTP 5xx, e.g. 503 "high demand"); model replies are never re-rolled.

score: grades stored replies, no network. Writes eval/recipe_import/results/<run>.md and .json. Pass bar (decided
2026-11-09): at least 9 of the 10 cases pass.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from smartbite_engine.contracts import parse_reply, validate_output
from smartbite_engine.names import foods
from smartbite_engine.prompts import import_prompt

from .. import live
from .grade import CONTRACT, grade_case

HERE = Path(__file__).resolve().parent
REPLIES = HERE / "replies"
RESULTS = HERE / "results"
PROMPT_FILE = live.ROOT / "prompts" / "import.md"
PROVIDERS = ("gemini", "anthropic")
STEP = "recipe"  # the import call uses the recipe call's settings (decided 2026-11-10)
PASS_BAR = 9


def load_cases():
    return json.loads((HERE / "cases.json").read_text(encoding="utf-8"))["cases"]


def select(cases, wanted):
    if not wanted:
        return cases
    ids = [w.strip() for w in wanted.split(",") if w.strip()]
    unknown = [w for w in ids if w not in {c["id"] for c in cases}]
    if unknown:
        raise live.LiveError(f"no golden case {', '.join(unknown)}")
    return [c for c in cases if c["id"] in ids]


def ask(runner, case, prompt):
    """(parsed reply or None, reply text, error). Two tries at most."""
    budget = {"calls": 0}
    messages = [{"role": "user", "content": prompt["user"]}]
    text = None
    for try_no in (1, 2):
        try:
            text, assistant = runner.call(case["id"], "import", 1, try_no, STEP, prompt["system"], messages, budget)
        except live.CallFailed as e:
            return None, e.text or text, str(e)
        data, errors = parse_reply(text)
        if not errors:
            errors = validate_output(data, CONTRACT)
        if not errors:
            return data, text, None
        runner.calls[-1]["contract_errors"] = errors[:5]
        if try_no == 2:
            return None, text, "reply not valid twice: " + "; ".join(errors[:5])
        messages = [*messages, assistant, {"role": "user", "content": live.retry_message(errors)}]


def provider_failed(path):
    """True when a stored case got no reply because the provider failed (HTTP 5xx or no connection): only those
    are run again on --resume (429 quota too). A reply the model gave, valid or not, is never asked again."""
    if not path.exists():
        return True
    stored = json.loads(path.read_text(encoding="utf-8"))
    return stored.get("reply") is None and bool(re.match(r"HTTP (429|5\d\d|None)", stored.get("error") or ""))


def run_live(run, cases, max_usd, key, model, min_gap_s, *, transport=live.urllib_transport, replies=REPLIES,
             log=print, resume=False, provider="gemini"):
    folder = Path(replies) / run
    if resume:
        if not folder.is_dir():
            raise live.LiveError(f"nothing to resume: no replies at {folder}")
        cases = [c for c in cases if provider_failed(folder / f"{c['id']}.json")]
        log(f"resume: {len(cases)} cases had a provider error: {', '.join(c['id'] for c in cases) or 'none'}")
    elif folder.exists() and any(folder.iterdir()):
        raise live.LiveError(f"refusing to start: {folder} already has replies; pick a new --run name")
    folder.mkdir(parents=True, exist_ok=True)
    runner = live.Runner(provider, key, max_usd, transport=transport, model=model, log=log, min_gap_s=min_gap_s,
                         packs={})
    known = foods()
    stopped = None
    for case in cases:
        log(f"{case['id']}:")
        prompt = import_prompt(case["paste"], known_ingredients=known)
        try:
            data, text, error = ask(runner, case, prompt)
        except live.LiveError as e:
            stopped = str(e)
            data, text, error = None, None, stopped
        calls = [c for c in runner.calls if c["case"] == case["id"]]
        path = folder / f"{case['id']}.json"
        if resume and path.exists():  # keep the provider errors of earlier tries in the call log
            calls = json.loads(path.read_text(encoding="utf-8")).get("calls", []) + calls
        path.write_text(json.dumps(
            {"case": case["id"], "model": runner.model, "reply": data, "text": text, "error": error, "calls": calls},
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        if stopped:
            log(f"STOP: {stopped}")
            break
    return runner, stopped


def score(run, *, replies=REPLIES, results=RESULTS, cases=None):
    cases = load_cases() if cases is None else cases
    folder = Path(replies) / run
    if not folder.is_dir():
        raise live.LiveError(f"no replies at {folder}")
    known = set(foods())
    graded, calls, model = [], [], None
    for case in cases:
        path = folder / f"{case['id']}.json"
        if not path.exists():
            continue
        stored = json.loads(path.read_text(encoding="utf-8"))
        model = stored.get("model") or model
        calls += stored.get("calls", [])
        g = grade_case(case, stored.get("reply"), known)
        if stored.get("error") and stored.get("reply") is None:
            g["fails"].insert(0, stored["error"])
        graded.append(g)
    passed = sum(g["passed"] for g in graded)
    summary = {"run": run, "model": model, "prompt": str(PROMPT_FILE.relative_to(live.ROOT)),
               "prompt_sha": _sha(PROMPT_FILE), "scored_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "cases": len(graded), "passed": passed, "bar": PASS_BAR, "meets_bar": passed >= PASS_BAR,
               "calls": len(calls), "input_tokens": sum(c["input_tokens"] for c in calls),
               "output_tokens": sum(c["output_tokens"] for c in calls),
               "cost_usd_if_paid": round(sum(c["cost_usd"] for c in calls), 4), "results": graded}
    Path(results).mkdir(parents=True, exist_ok=True)
    (Path(results) / f"{run}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n",
                                               encoding="utf-8")
    (Path(results) / f"{run}.md").write_text(report(summary), encoding="utf-8")
    return summary


def _sha(path):
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def report(s):
    out = [f"# Recipe import eval: {s['run']}", "",
           f"Model {s['model']}, temperature: provider default, prompt {s['prompt']} (sha256 {s['prompt_sha']}), "
           f"scored {s['scored_at']}.", "",
           f"**{s['passed']} of {s['cases']} cases pass** (bar: {s['bar']} of 10). "
           f"{s['calls']} calls, {s['input_tokens']} input and {s['output_tokens']} output tokens "
           f"(${s['cost_usd_if_paid']:.4f} at paid prices).", "",
           "| Case | Result | Servings | Why it failed |", "|---|---|---|---|"]
    for g in s["results"]:
        why = "; ".join(g["fails"]) or ""
        out.append(f"| {g['id']} | {'pass' if g['passed'] else 'FAIL'} | {g['servings']} | {why} |")
    for g in s["results"]:
        out += ["", f"## {g['id']}", "", "| Line | Want | Got | Amount | Window | OK |", "|---|---|---|---|---|---|"]
        for r in g["rows"]:
            ok = "yes" if r["ok"] else ("no" if r["level"] == "fail" else "note")
            got = ", ".join(r["got"]) or "-"
            amount = "" if r["grams"] is None else r["grams"]
            out.append(f"| {r['line']} | {' or '.join(r['accept'])} | {got} | {amount} | {r['window'] or ''} | "
                       f"{ok}{': ' + r['problem'] if r.get('problem') else ''} |")
        if g["notes"]:
            out += ["", "Notes (not counted): " + "; ".join(g["notes"])]
    return "\n".join(out) + "\n"


def main(argv=None, *, transport=live.urllib_transport, root=live.ROOT):
    parser = argparse.ArgumentParser(prog="eval.recipe_import.run", description="Recipe import eval (module doc).")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_live = sub.add_parser("live")
    p_live.add_argument("--run", required=True)
    p_live.add_argument("--provider", choices=PROVIDERS, default="gemini")
    p_live.add_argument("--model", help="default: the web app's model for that provider")
    p_live.add_argument("--cases")
    p_live.add_argument("--max-usd", type=float, default=1.00)
    p_live.add_argument("--min-gap", type=float, default=6.0, help="seconds between call starts (free tier limits)")
    p_live.add_argument("--dry-run", action="store_true")
    p_live.add_argument("--resume", action="store_true",
                        help="run again only the cases of --run that got a provider error (HTTP 5xx)")
    p_score = sub.add_parser("score")
    p_score.add_argument("run")
    args = parser.parse_args(argv)
    try:
        if args.cmd == "score":
            s = score(args.run)
        else:
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.run):
                raise live.LiveError("--run may use letters, digits, '.', '_' and '-' only")
            args.model = args.model or live.PROVIDERS[args.provider]["model"]
            if args.model not in live.PROVIDERS[args.provider]["models"] or args.model not in live.PRICES:
                raise live.LiveError(f"--model {args.model!r} is not a priced {args.provider} model")
            cases = select(load_cases(), args.cases)
            known = foods()
            if args.dry_run:
                sizes = [sum(map(len, import_prompt(c["paste"], known_ingredients=known).values())) for c in cases]
                print(f"{len(cases)} cases, up to {2 * len(cases)} calls, prompts {min(sizes)} to {max(sizes)} "
                      "characters. No network call made.")
                return 0
            live.check_prices_valid(args.model)
            key = live.load_key(root, live.PROVIDERS[args.provider]["env_key"])
            runner, stopped = run_live(args.run, cases, args.max_usd, key, args.model, args.min_gap,
                                       transport=transport, resume=args.resume, provider=args.provider)
            s = score(args.run)
            if stopped:
                print(f"stopped: {stopped}", file=sys.stderr)
    except live.LiveError as e:
        print(f"eval.recipe_import: {e}", file=sys.stderr)
        return 2
    print(f"{s['passed']} of {s['cases']} pass (bar {s['bar']}). {s['calls']} calls. "
          f"Report: {RESULTS / (s['run'] + '.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
