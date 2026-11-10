"""Piece weights for the recipe import: the table, the lookup and the reply rewrite."""
import importlib.util
import json
from pathlib import Path

import pytest

from smartbite_engine.names import foods
from smartbite_engine.pieces import TABLE, apply_pieces, counts_pieces, piece_grams

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "data" / "build" / "build_piece_weights.py"


def test_table_rows_name_their_usda_source_and_known_foods():
    data = json.loads(TABLE.read_text(encoding="utf-8"))["foods"]
    known = set(foods())
    assert {"onion", "potato", "garlic", "red bell pepper", "carrot", "tomato"} <= set(data)
    assert {n for n in data if n not in known} == {"celery", "chili pepper", "leek"}  # weighed though unlisted
    for entry in data.values():
        assert entry["fdc_id"] and entry["usda_food"] and "medium" in entry["grams"]
        assert set(entry["grams"]) == set(entry["usda_portion"])


def test_piece_grams_uses_usda_sizes_and_scales_missing_ones():
    assert piece_grams("potato", 4, "large") == 1476.0  # 4 x 369 g
    assert piece_grams("Onion", 0.5, "medium") == 55.0
    assert piece_grams("garlic", 6, "medium") == 18.0
    assert piece_grams("celery", 1.5, "medium") == 60.0
    assert piece_grams("chile pepper", 1, "medium") == 45.0  # alias
    assert piece_grams("garlic", 2, "large") == 9.0  # no USDA large clove: 1.5 x medium
    assert piece_grams("chorizo", 1, "medium") is None
    assert piece_grams("onion", 1, "huge") is None
    assert piece_grams("spring onion", 1, "medium") is None  # left out: a US scallion is not a cebolla tierna


def test_apply_pieces_rewrites_only_table_foods_with_pieces():
    reply = {"servings": None, "ingredients": [
        {"line": "4 patatas grandes", "name": "potato", "grams_total": 800, "pieces": {"count": 4, "size": "large"}},
        {"line": "1 chorizo", "name": "chorizo", "grams_total": 125, "pieces": {"count": 1, "size": "medium"}},
        {"line": "1 onion", "name": "onion", "grams_total": 120},
        {"line": "1/2 cup carrot, shredded", "name": "carrot", "grams_total": 55, "pieces": {"count": 1, "size": "small"}}]}
    out = apply_pieces(reply)
    assert [i["grams_total"] for i in out["ingredients"]] == [1476.0, 125, 120, 55]  # cup line keeps its grams
    assert out["ingredients"][0]["grams_from"] == "pieces" and "grams_from" not in out["ingredients"][1]
    assert reply["ingredients"][0]["grams_total"] == 800  # the reply itself is not changed


@pytest.mark.skipif(not (ROOT / "data" / "raw" / "usda" / "FoodData_Central_sr_legacy_food_csv_2018-04.zip").exists(),
                    reason="USDA zip not downloaded (data/raw is not in git)")
def test_table_matches_a_fresh_build():
    spec = importlib.util.spec_from_file_location("build_piece_weights", BUILD)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.build() == json.loads(TABLE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("line, pieces", [
    ("4 patatas grandes", True), ("* 4 huevos grandes", True), ("½ yellow onion", True), ("1-2 stalks celery", True),
    ("1 tallo de porro", True), ("2 dientes de ajo", True), ("1/2 cup carrot, shredded", False),
    ("1 large can (12 oz) tuna", False), ("Juice of ½ lemon", False), ("1 bunch of fresh asparagus", False),
    ("2 cucharadas de aceite", False), ("Season with 2 onions", False)])
def test_counts_pieces(line, pieces):
    assert counts_pieces(line) is pieces
