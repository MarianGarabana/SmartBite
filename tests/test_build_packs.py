import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("build_packs", ROOT / "data" / "build" / "build_packs.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)


@pytest.mark.parametrize("text, grams", [
    ("400 g", 400), ("400g", 400), ("400 gr", 400), ("1 kg", 1000), ("1,5 kg", 1500), ("0.464 kg", 464),
    ("1.000 g", 1000), ("500 ml", 500), ("1 l", 1000), ("75 cl", 750), ("3 x 80 g", 240), ("3x80g", 240),
    ("125 g x 4", 500), ("pack de 3 latas de 80 g", 240), ("250 g (2 x 125 g)", 250), ("400 g ℮", 400),
    ("", None), ("sin dato", None),
])
def test_parse_quantity(text, grams):
    assert bp.parse_quantity(text) == grams


@pytest.mark.parametrize("text, grams", [
    ("Peso neto 400 g, peso escurrido 240 g", 240),
    ("420 g (240 g escurrido)", 240),
    ("3 x 80 g (3 x 56 g escurrido)", 168),
    ("3 x 80 g (168 g escurrido)", 168),
    ("Escurrido: 240 g", 240),
    # The number after "escurrido" belongs to the next field here
    ("390 g neto, 240 g escurrido, 425 ml", 240),
    ("410 g (neto), 250 g (escurrido), 445 ml", 250),
    ("400 g", 400),  # no drained weight on the label: net weight
])
def test_parse_quantity_uses_drained_weight_for_cans(text, grams):
    assert bp.parse_quantity(text, drained=True) == grams


def test_parse_quantity_without_drained_flag_keeps_net_weight():
    assert bp.parse_quantity("Peso neto 400 g, peso escurrido 240 g") == 400


def test_parse_quantity_density_and_fallback_field():
    assert bp.parse_quantity("1 l", density=0.92) == 920
    assert bp.parse_quantity("500 g", density=0.92) == 500  # density only for volumes
    assert bp.parse_quantity("", "250", "g") == 250
    assert bp.parse_quantity("", "500", "ml", density=1.03) == 515
    assert bp.parse_quantity("30000 g") is None  # not a retail pack


@pytest.mark.parametrize("text, units", [
    ("12 huevos", 12), ("6 uds", 6), ("Clase M, 12 unidades", 12), ("docena", 12), ("media docena", 6),
    ("12", 12), ("sin dato", None),
])
def test_parse_units_for_eggs(text, units):
    assert bp.parse_units(text) == units


def row(name, quantity, cats="", code=None, generic=""):
    return {"code": code or name + quantity, "product_name": name, "generic_name": generic,
            "categories_tags": cats, "quantity": quantity}


SPEC = ("pack", r"garbanzo", ["en:canned-chickpeas"], r"hummus", {"drained": True, "or_name": r"cocid"})


def test_matches_needs_name_and_category_or_proof_name():
    assert bp.matches(row("Garbanzos", "400 g", "en:canned-chickpeas"), SPEC)
    assert bp.matches(row("Garbanzos cocidos", "400 g"), SPEC)  # no category, but the name says cooked
    assert not bp.matches(row("Garbanzos", "1 kg", "en:dried-chickpeas"), SPEC)
    assert not bp.matches(row("Hummus de garbanzo", "200 g", "en:canned-chickpeas"), SPEC)
    # Accents and case do not matter
    assert bp.matches(row("GARBANZO Cocído", "400 g"), SPEC)


def test_typical_sizes_takes_most_common_with_share():
    n, sizes = bp.typical_sizes([400] * 6 + [570] * 3 + [250] * 1)
    assert n == 10 and sizes == [(400, 0.6), (570, 0.3)]  # 250 g is a single product


def test_food_entry_counts_each_product_once_and_reads_drained_weight():
    rows = ([row("Garbanzos cocidos", "570 g (400 g escurrido)", code=str(i)) for i in range(4)]
            + [row("Garbanzos cocidos", "300 g", code=str(i)) for i in range(10, 13)]
            + [row("Garbanzos cocidos", "570 g (400 g escurrido)", code="0")])  # duplicate barcode
    entry, n = bp.food_entry("canned chickpeas", SPEC, rows)
    assert n == 7
    assert entry["typical_packs"] == [{"grams": 400, "share": 0.57}, {"grams": 300, "share": 0.43}]
    assert entry["default_grams"] == 400 and entry["source"] == "off"
    assert "Drained weight" in entry["note"]


def test_food_entry_is_none_when_off_is_thin():
    rows = [row("Garbanzos cocidos", "400 g", code=str(i)) for i in range(3)]
    assert bp.food_entry("canned chickpeas", SPEC, rows) == (None, 3)


def test_egg_entry_in_units_with_size_m_grams():
    spec = ("per_unit", r"huevo", ["en:eggs"], r"codorniz", {})
    rows = ([row("Huevos frescos", "12 uds", "en:eggs", code=f"a{i}") for i in range(5)]
            + [row("Huevos camperos", "6 huevos", "en:eggs", code=f"b{i}") for i in range(3)]
            + [row("Huevos de codorniz", "18 uds", "en:eggs", code="c")])
    entry, n = bp.food_entry("eggs", spec, rows)
    assert n == 8 and entry["units_per_pack"] == 12 and entry["default_grams"] == 12 * 51
    assert entry["typical_packs"][1] == {"grams": 6 * 51, "units": 6, "share": 0.38}


ONION_PIECE = {"unit": "1 medium", "portion": {"source": "usda_sr_legacy", "fdc_id": 170000, "food": "Onions, raw",
                                              "description": '1 medium (2-1/2" dia)', "gram_weight": 110}}


def test_build_uses_pieces_overrides_and_reports_missing(monkeypatch):
    monkeypatch.setattr(bp, "FOODS", {
        "onion": ("per_kg", None, None, None, {}),
        "canned chickpeas": SPEC,
        "ground chicken": ("pack", r"pollo picado", None, None, {}),
        "kale": ("pack", r"kale", None, None, {}),
        "lime": ("per_kg", None, None, None, {}),  # loose, but no piece and no override: missing
    })
    rows = [row("Garbanzos cocidos", "400 g", code=str(i)) for i in range(6)]
    overrides = {"ground chicken": {"sold_by": "pack", "typical_packs": [{"grams": 400, "share": None}], "reason": "Thin."}}
    foods, n_off = bp.build(rows, overrides, {"onion": ONION_PIECE})
    onion = foods["onion"]
    assert onion["sold_by"] == "per_kg" and onion["default_grams"] == 110 and onion["source"] == "usda_portion"
    assert onion["typical_packs"] == [{"grams": 110, "share": None}] and onion["unit"] == "1 medium"
    assert onion["portion"]["fdc_id"] == 170000 and "fdc 170000" in onion["note"]
    assert foods["canned chickpeas"]["default_grams"] == 400
    assert foods["ground chicken"] == {"sold_by": "pack", "typical_packs": [{"grams": 400, "share": None}],
                                     "default_grams": 400, "n_products": 0, "note": "Thin.", "source": "override"}
    assert "kale" not in foods and "lime" not in foods
    report = bp.coverage_md(foods, n_off, "2026-10-18")
    assert "5 foods: 1 from Open Food Facts, 1 loose by the piece (USDA portions), 1 from overrides, 2 missing." in report
    assert '| onion | 1 medium | 110 | Onions, raw (170000) | 1 medium (2-1/2" dia) |' in report
    assert report.rstrip().endswith("kale, lime")


def _usda_zip(path):
    """A tiny SR Legacy bulk zip with the two tables the portion reader uses."""
    import zipfile
    folder = "FoodData_Central_sr_legacy_food_csv_2018-04/"
    with zipfile.ZipFile(path / bp.USDA_FILES["usda_sr_legacy"][0], "w") as z:
        z.writestr(folder + "food.csv", '"fdc_id","data_type","description","food_category_id","publication_date"\n'
                                        '"170000","sr_legacy_food","Onions, raw","11","2019-04-01"\n'
                                        '"169230","sr_legacy_food","Garlic, raw","11","2019-04-01"\n')
        header = '"id","fdc_id","seq_num","amount","measure_unit_id","portion_description","modifier","gram_weight","data_points","footnote","min_year_acquired"\n'
        z.writestr(folder + "food_portion.csv", header
                   + '"1","170000","1","1","9999","","large","150","","",""\n'
                   + '"2","170000","2","1","9999","","medium (2-1/2"" dia)","110","","",""\n'
                   + '"3","169230","1","1","9999","","clove","3","","",""\n')


def test_piece_portions_reads_the_usda_portion_and_checks_overrides(tmp_path):
    _usda_zip(tmp_path)
    pieces = {"onion": ("usda_sr_legacy", 170000, 'medium (2-1/2" dia)', "1 medium")}
    garlic = {"portion": {"source": "usda_sr_legacy", "fdc_id": 169230, "food": "Garlic, raw", "description": "1 clove",
                          "gram_weight": 3}}
    out = bp.piece_portions({"garlic": garlic}, usda_dir=tmp_path, pieces=pieces)
    assert out == {"onion": ONION_PIECE}
    # An override portion that does not match the USDA row fails the build
    wrong = {"portion": {**garlic["portion"], "gram_weight": 5}}
    with pytest.raises(ValueError):
        bp.piece_portions({"garlic": wrong}, usda_dir=tmp_path, pieces=pieces)
    with pytest.raises(LookupError):
        bp.piece_portions({}, usda_dir=tmp_path, pieces={"onion": ("usda_sr_legacy", 170000, "small", "1 small")})


def test_loose_produce_is_bought_by_the_piece_with_its_usda_source():
    import json
    foods = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
    loose = {f for f, spec in bp.FOODS.items() if spec[0] == "per_kg"} | {"garlic", "fresh parsley"}
    assert set(bp.PIECES) <= loose
    for food in loose:
        e = foods[food]
        assert e["sold_by"] == "per_kg" and e["default_grams"] < 1000, food
        assert e["unit"] and e["portion"]["fdc_id"] and e["portion"]["description"], food
        assert e["source"] in ("usda_portion", "override"), food
    assert foods["garlic"]["unit"] == "1 head" and foods["fresh parsley"]["unit"] == "1 bunch"
    assert foods["spring onion"]["unit"] == "1 bunch" and foods["lettuce"]["unit"] == "1 head"
    assert foods["broccoli"]["unit"] == "1 head" and foods["cauliflower"]["unit"] == "1 head"


def test_food_specs_and_overrides_use_the_english_keys():
    import json
    keys = set(json.loads((ROOT / "data" / "open" / "aliases.json").read_text(encoding="utf-8"))["foods"])
    overrides = json.loads(bp.OVERRIDES.read_text(encoding="utf-8"))["foods"]
    assert set(bp.FOODS) == keys
    assert set(overrides) <= set(bp.FOODS)
