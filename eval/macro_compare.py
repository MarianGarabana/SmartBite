"""Per-serving kcal and protein: open engine vs the personal app's saved values, for the 13 demo meals.

    .venv/bin/python -m eval.macro_compare --source <personal app>/meals

The personal values are the reference, not ground truth: they come from the personal app's own nutrition sources
(product labels and a national food table). The open engine uses Ciqual 2025 and USDA FoodData Central only.
Each saved meal goes through the same conversion as the demo meals (data/build/build_demo_meals.py) and then
smartbite_engine.meal.evaluate. Writes eval/results/macro-compare.md.
"""
import argparse
import importlib.util
import json
from pathlib import Path

from smartbite_engine.meal import evaluate

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "eval" / "results"
OUT = RESULTS / "macro-compare.md"
WITHIN_PCT = 10.0


def _build_module():
    spec = importlib.util.spec_from_file_location("build_demo_meals", ROOT / "data" / "build" / "build_demo_meals.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pct_error(value, reference):
    return 100 * (value - reference) / reference


def rows_for(source):
    build = _build_module()
    rows = []
    for stem in build.MEALS:
        saved = json.loads((Path(source) / f"{stem}.json").read_text(encoding="utf-8"))
        doc = build.convert(stem, saved, [], [])
        meal = evaluate(doc["form"], doc["picked_idea"], doc["recipe"])
        ref, got = saved["evaluation"]["macros"]["per_serving"], meal["evaluation"]["macros"]["per_serving"]
        rows.append({"slug": build.slugify(doc["recipe"]["title"]), "title": doc["recipe"]["title"],
                     "ref_kcal": ref["kcal"], "open_kcal": got["kcal"],
                     "ref_protein": ref["protein_g"], "open_protein": got["protein_g"],
                     "kcal_err": pct_error(got["kcal"], ref["kcal"]),
                     "protein_err": pct_error(got["protein_g"], ref["protein_g"]),
                     "missing": [m.split(":")[0] for m in meal["evaluation"]["macros"]["missing_nutrition"]
                                 if "left out" in m]})
    return rows


def aggregate(rows, key):
    errors = [abs(r[key]) for r in rows]
    return {"n": len(errors), "mean_abs_pct": sum(errors) / len(errors), "max_abs_pct": max(errors),
            "within": sum(e <= WITHIN_PCT for e in errors)}


def _agg_line(label, rows):
    k, p = aggregate(rows, "kcal_err"), aggregate(rows, "protein_err")
    return (f"| {label} | {k['n']} | {k['mean_abs_pct']:.1f}% | {k['max_abs_pct']:.1f}% | {k['within']} of {k['n']} | "
            f"{p['mean_abs_pct']:.1f}% | {p['max_abs_pct']:.1f}% | {p['within']} of {p['n']} |")


def render(rows):
    complete = [r for r in rows if not r["missing"]]
    lines = [
        "# Macro compare: open engine vs personal app",
        "",
        "Per-serving kcal and protein for the 13 demo meals. Built by `eval/macro_compare.py`; do not edit by hand.",
        "",
        "**Reference, not ground truth.** The personal values come from the personal app's own nutrition sources "
        "(product labels and a national food table). The open engine uses Ciqual 2025 and USDA FoodData Central "
        "for generic foods. A difference shows how far generic table values sit from those sources, not which one "
        "is right.",
        "",
        "Error = (open - reference) / reference. \"Within 10%\" counts meals with an absolute error of 10% or less.",
        "",
        "## Aggregates",
        "",
        "| Meals | n | kcal mean abs error | kcal max | kcal within 10% | protein mean abs error | protein max | "
        "protein within 10% |",
        "|---|---|---|---|---|---|---|---|",
        _agg_line("All", rows),
    ]
    if len(complete) != len(rows):
        lines.append(_agg_line("With full nutrition in the open table", complete))
    lines += [
        "",
        "## Per meal",
        "",
        "| Meal | kcal ref | kcal open | kcal error | protein ref (g) | protein open (g) | protein error | "
        "not in the open table |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| {r['title']} | {r['ref_kcal']:.0f} | {r['open_kcal']:.0f} | {r['kcal_err']:+.1f}% | "
                     f"{r['ref_protein']:.1f} | {r['open_protein']:.1f} | {r['protein_err']:+.1f}% | "
                     f"{', '.join(r['missing']) or '-'} |")
    if len(complete) != len(rows):
        lines += ["", "Foods with no record in the open table are left out of that meal's open totals, so those "
                      "meals read low."]
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", required=True, type=Path, help="folder with the personal app's saved meals")
    args = ap.parse_args(argv)
    rows = rows_for(args.source)
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(rows), encoding="utf-8")
    complete = [r for r in rows if not r["missing"]]
    for label, subset in (("all", rows), ("full nutrition", complete)):
        k, p = aggregate(subset, "kcal_err"), aggregate(subset, "protein_err")
        print(f"{label} (n={k['n']}): kcal mean abs {k['mean_abs_pct']:.1f}%, max {k['max_abs_pct']:.1f}%, "
              f"within 10% {k['within']}/{k['n']}; protein mean abs {p['mean_abs_pct']:.1f}%, "
              f"max {p['max_abs_pct']:.1f}%, within 10% {p['within']}/{p['n']}")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
