"""Build data/open/nutrition/per-100g.json and review.md from the raw Ciqual 2025 and USDA FDC downloads.

Run from the repo root: python data/build/build_nutrition.py
Raw files (gitignored, see SOURCES.md for where they come from):
  data/raw/ciqual/alim_2025_11_03.xml, compo_2025_11_03.xml
  data/raw/usda/FoodData_Central_foundation_food_csv_2026-04-30.zip
  data/raw/usda/FoodData_Central_sr_legacy_food_csv_2018-04.zip
The food -> source record choice lives in data/build/nutrition-map.json, picked by hand.
"""
import argparse
import csv
import io
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
# Fiber and micronutrients: a record has the key only when the source has a value (no key = unknown, never 0)
EXTRA = ("fiber_g", "iron_mg", "calcium_mg", "potassium_mg", "magnesium_mg", "zinc_mg", "vitamin_a_ug",
         "vitamin_c_mg", "vitamin_d_ug", "vitamin_b12_ug", "folate_ug")
STATES = ("raw", "cooked", "dry", "canned", "frozen")

# Ciqual constant codes, values per 100 g edible portion
CIQUAL_CODES = {"328": "kcal", "25000": "protein_g", "31000": "carbs_g", "40000": "fat_g",
                "34100": "fiber_g", "10260": "iron_mg", "10200": "calcium_mg", "10190": "potassium_mg",
                "10120": "magnesium_mg", "10300": "zinc_mg", "51104": "vitamin_a_ug", "55100": "vitamin_c_mg",
                "52100": "vitamin_d_ug", "56600": "vitamin_b12_ug", "56700": "folate_ug"}
# Vitamin A is Ciqual's retinol equivalent (51104), never retinol or beta-carotene alone. Ciqual gives a food either
# total folates (56700) or folates as DFE (56702), never both; for foods without added folic acid they are the same.
CIQUAL_FOLATE_DFE = "56702"
CIQUAL_ALIM = "alim_2025_11_03.xml"
CIQUAL_COMPO = "compo_2025_11_03.xml"

# USDA nutrient ids in order of preference. Foundation Foods often has no 1008 Energy,
# only the Atwater values, and some records give carbs by summation or NLEA fat only.
# 1005 (carbs by difference) includes fiber; Ciqual and EU labels leave it out, so fiber (1079) is subtracted.
USDA_IDS = {"kcal": ("1008", "2048", "2047"), "protein_g": ("1003",),
            "carbs_g": ("1005", "1050"), "fat_g": ("1004", "1085")}
USDA_FIBER = "1079"
# Vitamin A as RAE (1106), vitamin D in µg (1114, not IU), folate total (1177)
USDA_EXTRA = {"fiber_g": USDA_FIBER, "iron_mg": "1089", "calcium_mg": "1087", "potassium_mg": "1092",
              "magnesium_mg": "1090", "zinc_mg": "1095", "vitamin_a_ug": "1106", "vitamin_c_mg": "1162",
              "vitamin_d_ug": "1114", "vitamin_b12_ug": "1178", "folate_ug": "1177"}
USDA_FILES = {"usda_foundation": ("FoodData_Central_foundation_food_csv_2026-04-30.zip", "foundation_food"),
              "usda_sr_legacy": ("FoodData_Central_sr_legacy_food_csv_2018-04.zip", "sr_legacy_food")}


def ciqual_value(text):
    """Ciqual teneur to a number in the constituent's unit. '-' or empty is no value (None).
    'traces' and '< x' are below the detection or quantification limit: 0, for macros, fiber and micronutrients
    alike, so a nutrient is never overstated."""
    text = (text or "").strip()
    if text in ("", "-"):
        return None
    if text == "traces" or text.startswith("<"):
        return 0.0
    return float(text.replace(",", "."))


def load_ciqual(raw_dir):
    """{alim_code: {name, name_fr, values}} with values only for the macros, fiber and micronutrients."""
    raw_dir = Path(raw_dir)
    foods = {}
    for alim in ET.parse(raw_dir / CIQUAL_ALIM).getroot().iter("ALIM"):
        code = alim.findtext("alim_code").strip()
        foods[code] = {"name": (alim.findtext("alim_nom_eng") or "").strip(),
                       "name_fr": (alim.findtext("alim_nom_fr") or "").strip(), "values": {}}
    # compo is large: stream it and keep only the rows we use
    dfe = {}
    for _, elem in ET.iterparse(raw_dir / CIQUAL_COMPO):
        if elem.tag != "COMPO":
            continue
        const = elem.findtext("const_code").strip()
        field = CIQUAL_CODES.get(const)
        code = elem.findtext("alim_code").strip()
        if field and code in foods:
            foods[code]["values"][field] = ciqual_value(elem.findtext("teneur"))
        elif const == CIQUAL_FOLATE_DFE and code in foods:
            dfe[code] = ciqual_value(elem.findtext("teneur"))
        elem.clear()
    for code, value in dfe.items():
        if foods[code]["values"].get("folate_ug") is None:
            foods[code]["values"]["folate_ug"] = value
    return foods


def _csv_rows(archive, name):
    member = next(n for n in archive.namelist() if n.endswith("/" + name) or n == name)
    with archive.open(member) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))


def load_usda(zip_path, data_type):
    """{fdc_id: {name, values}} for one FDC bulk CSV zip, only foods of data_type."""
    wanted = {i for ids in USDA_IDS.values() for i in ids} | set(USDA_EXTRA.values())
    with zipfile.ZipFile(zip_path) as archive:
        foods = {row["fdc_id"]: {"name": row["description"], "amounts": {}}
                 for row in _csv_rows(archive, "food.csv") if row["data_type"] == data_type}
        for row in _csv_rows(archive, "food_nutrient.csv"):
            food = foods.get(row["fdc_id"])
            if food is not None and row["nutrient_id"] in wanted and row["amount"] != "":
                food["amounts"][row["nutrient_id"]] = float(row["amount"])
    for food in foods.values():
        amounts = food.pop("amounts")
        food["values"] = {field: next((amounts[i] for i in ids if i in amounts), None)
                          for field, ids in USDA_IDS.items()}
        if "1005" in amounts:
            food["values"]["carbs_g"] = max(0.0, amounts["1005"] - amounts.get(USDA_FIBER, 0.0))
        food["values"].update({field: amounts[i] for field, i in USDA_EXTRA.items() if i in amounts})
    return foods


def load_sources(raw_dir):
    raw_dir = Path(raw_dir)
    sources = {"ciqual": load_ciqual(raw_dir / "ciqual")}
    for kind, (filename, data_type) in USDA_FILES.items():
        sources[kind] = load_usda(raw_dir / "usda" / filename, data_type)
    return sources


def build_record(name, entry, sources):
    """One per-100g.json record from a map entry {source, id, state, note}."""
    kind, source_id = entry["source"], str(entry["id"])
    if entry["state"] not in STATES:
        raise ValueError(f"{name}: state {entry['state']!r} not in {STATES}")
    found = sources[kind].get(source_id)
    if found is None:
        raise LookupError(f"{name}: {kind} id {source_id} not in the raw files")
    values = found["values"]
    missing = [field for field in FIELDS if values.get(field) is None]
    if "kcal" in missing:
        raise ValueError(f"{name}: {kind} {source_id} has no energy value, pick another record")
    record = {field: round(values.get(field) or 0.0, 2) for field in FIELDS}
    record.update({field: round(values[field], 2) for field in EXTRA if values.get(field) is not None})
    record.update({"source": "ciqual" if kind == "ciqual" else "usda", "source_id": source_id,
                   "source_name": found["name"], "state": entry["state"], "match_note": entry["note"]})
    if kind != "ciqual":
        record["usda_dataset"] = "foundation" if kind == "usda_foundation" else "sr_legacy"
    if missing:
        record["missing"] = missing  # no value in the source, counted as 0
    return record


def build(food_map, sources):
    return {name: build_record(name, entry, sources) for name, entry in sorted(food_map.items())}


def review_lines(food_map, foods):
    lines = []
    for name, entry in sorted(food_map.items()):
        if entry.get("review"):
            rec = foods[name]
            lines.append(f"- **{name}**: {rec['source']} {rec['source_id']} \"{rec['source_name']}\" "
                         f"({rec['state']}). {entry['review']}")
        if foods[name].get("missing"):
            lines.append(f"- **{name}**: no value for {', '.join(foods[name]['missing'])} in the source, counted as 0.")
    return lines


def write_outputs(food_map, foods, dropped, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    table = {"note": "Macros, fiber and micronutrients per 100 g edible portion, one record per food. A missing fiber or "
                     "micronutrient key means the source has no value (unknown, not 0). Built by data/build/build_nutrition.py "
                     "from Ciqual 2025 and USDA FoodData Central (see SOURCES.md). Do not edit by hand: "
                     "change data/build/nutrition-map.json and rebuild.",
             "foods": foods}
    (out_dir / "per-100g.json").write_text(json.dumps(table, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    counts = {s: sum(1 for f in foods.values() if f["source"] == s) for s in ("ciqual", "usda")}
    lines = review_lines(food_map, foods)
    text = ["# Nutrition matches to review", "",
            f"{len(foods)} foods: {counts['ciqual']} from Ciqual, {counts['usda']} from USDA. "
            f"{len(lines)} items below are judgment calls or weaker matches. "
            "To change one, edit data/build/nutrition-map.json and rerun data/build/build_nutrition.py.", "",
            "## Matches", ""] + lines
    if dropped:
        text += ["", "## Left out", ""] + [f"- **{name}**: {why}" for name, why in sorted(dropped.items())]
    (out_dir / "review.md").write_text("\n".join(text) + "\n", encoding="utf-8")
    return counts, len(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", default=ROOT / "data" / "raw")
    parser.add_argument("--map", default=ROOT / "data" / "build" / "nutrition-map.json")
    parser.add_argument("--out", default=ROOT / "data" / "open" / "nutrition")
    args = parser.parse_args(argv)

    spec = json.loads(Path(args.map).read_text(encoding="utf-8"))
    foods = build(spec["foods"], load_sources(args.raw))
    counts, n_review = write_outputs(spec["foods"], foods, spec.get("dropped", {}), args.out)
    print(f"{len(foods)} foods ({counts['ciqual']} ciqual, {counts['usda']} usda), {n_review} review items")


if __name__ == "__main__":
    main()
