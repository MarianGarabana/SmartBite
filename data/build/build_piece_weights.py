"""Weights of one piece (1 onion, 1 clove of garlic, 1 stalk of celery) by size -> data/open/piece-weights.json.

Run from the repo root:
  .venv/bin/python data/build/build_piece_weights.py

Source: USDA FoodData Central SR Legacy (April 2018), food_portion.csv, public domain, from the zip in data/raw/usda/.
Used by the recipe import (decided 2026-11-10): the model reads "4 large potatoes" as 4 pieces, size large, and code
turns that into grams with this table, so the weight of a piece comes from data, not from the model.

SPEC: app food name -> (fdc_id, piece word, {size: start of the USDA portion row after "1 "}, other names). A size with
no USDA row is left out; code then scales medium (small 0.6, large 1.5, the import prompt's rule).

Left out on purpose: spring onion. USDA's is a US scallion (15 g), while a Spanish "cebolla tierna" or "cebolleta" is
a young onion several times heavier (decided 2026-11-10), so the model's own grams are kept for it.
"""
import csv
import io
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ZIP = ROOT / "data" / "raw" / "usda" / "FoodData_Central_sr_legacy_food_csv_2018-04.zip"
DIR = "FoodData_Central_sr_legacy_food_csv_2018-04/"
OUT = ROOT / "data" / "open" / "piece-weights.json"

SPEC = {
    "apple": (171688, "piece", {"small": "small (2-3/4", "medium": "medium (3", "large": "large (3-1/4"}, ()),
    "avocado": (171705, "piece", {"medium": "avocado, NS"}, ()),
    "banana": (173944, "piece", {"small": "small (6", "medium": "medium (7", "large": "large (8"}, ()),
    "carrot": (170393, "piece", {"small": "small (5-1/2", "medium": "medium", "large": "large (7-1/4"}, ()),
    "cherry tomatoes": (170457, "piece", {"medium": "cherry"}, ()),
    "cucumber": (168409, "piece", {"medium": "cucumber (8-1/4"}, ()),
    "eggplant": (169228, "piece", {"medium": "eggplant, unpeeled"}, ()),
    "garlic": (169230, "clove", {"medium": "clove"}, ()),
    "green bell pepper": (170427, "piece", {"small": "small", "medium": "medium (approx", "large": "large (2-1/4"}, ()),
    "kiwi": (168153, "piece", {"medium": "fruit (2\" dia)"}, ()),
    "lemon": (167746, "piece", {"medium": "fruit (2-1/8", "large": "fruit (2-3/8"}, ()),
    "lime": (168155, "piece", {"medium": "fruit (2\" dia)"}, ()),
    "mushrooms": (169251, "piece", {"small": "small", "medium": "medium", "large": "large"}, ()),
    "onion": (170000, "piece", {"small": "small", "medium": "medium (2-1/2", "large": "large"}, ()),
    "orange": (169097, "piece", {"small": "small (2-3/8", "medium": "fruit (2-5/8", "large": "large (3-1/16"}, ()),
    "potato": (170026, "piece", {"small": "Potato small", "medium": "Potato medium", "large": "Potato large"}, ()),
    "red bell pepper": (170108, "piece", {"small": "small", "medium": "medium (approx", "large": "large (2-1/4"}, ()),
    "sweet potato": (168482, "piece", {"medium": "sweetpotato, 5\" long"}, ()),
    "tomato": (170457, "piece", {"small": "small whole", "medium": "medium whole", "large": "large whole"}, ()),
    "zucchini": (169291, "piece", {"small": "small", "medium": "medium", "large": "large"}, ()),
    # Not in the app's food list: kept under their own name by the import, still weighed by code
    "celery": (169988, "stalk", {"small": "stalk, small", "medium": "stalk, medium", "large": "stalk, large"}, ()),
    "chili pepper": (170497, "piece", {"medium": "pepper"},
                     ("chile pepper", "chilli pepper", "hot pepper", "green chili", "red chili", "chile", "chili")),
    "leek": (169246, "piece", {"medium": "leek"}, ()),
}


def rows(z, name):
    return csv.DictReader(io.TextIOWrapper(z.open(DIR + name), encoding="utf-8"))


def portion_text(p, units):
    unit = units.get(p["measure_unit_id"], "")
    unit = "" if unit == "undetermined" else unit
    return " ".join(x for x in (p["amount"], unit, p["modifier"], p["portion_description"]) if x).strip()


def pick(portions, units, match, fdc_id):
    """The one portion row of one piece whose text starts with "1 " + match."""
    found = [p for p in portions if portion_text(p, units).startswith(f"1 {match}")]
    if len(found) != 1:
        raise SystemExit(f"fdc {fdc_id}: {len(found)} portion rows match {match!r}: "
                         f"{[portion_text(p, units) for p in portions]}")
    return found[0]


def build(zip_path=ZIP):
    z = zipfile.ZipFile(zip_path)
    descriptions = {r["fdc_id"]: r["description"] for r in rows(z, "food.csv")}
    units = {r["id"]: r["name"] for r in rows(z, "measure_unit.csv")}
    wanted = {str(spec[0]) for spec in SPEC.values()}
    portions = {}
    for r in rows(z, "food_portion.csv"):
        if r["fdc_id"] in wanted:
            portions.setdefault(r["fdc_id"], []).append(r)
    foods = {}
    for name, (fdc_id, unit, sizes, aliases) in sorted(SPEC.items()):
        entry = {"unit": unit, "fdc_id": fdc_id, "usda_food": descriptions[str(fdc_id)], "grams": {}, "usda_portion": {}}
        for size, match in sizes.items():
            p = pick(portions.get(str(fdc_id), []), units, match, fdc_id)
            entry["grams"][size] = float(p["gram_weight"])
            entry["usda_portion"][size] = portion_text(p, units)
        if aliases:
            entry["aliases"] = list(aliases)
        foods[name] = entry
    return {"note": "Weight in grams of one piece by size (one clove for garlic, one stalk for celery). Built by "
                    "data/build/build_piece_weights.py from USDA FoodData Central SR Legacy (April 2018), "
                    "food_portion.csv, public domain. Do not edit by hand. A missing size is scaled from medium "
                    "by code (small 0.6, large 1.5).",
            "foods": foods}


if __name__ == "__main__":
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(data['foods'])} foods -> {OUT.relative_to(ROOT)}")
