import json
from pathlib import Path

import pytest

from smartbite_engine.names import (ALIASES, aliases, aliases_of, ambiguous, canonical, foods, pairs, plain, singular,
                                    stems)

ROOT = Path(__file__).resolve().parents[1]
OPEN = ROOT / "data" / "open"


def load(path):
    return json.loads((OPEN / path).read_text(encoding="utf-8"))


NUTRITION = load("nutrition/per-100g.json")["foods"]
PACKS = load("packs/packs.json")["foods"]
DROPPED = json.loads((ROOT / "data" / "build" / "nutrition-map.json").read_text(encoding="utf-8"))["dropped"]


def test_plain_strips_accents_case_and_spaces():
    assert plain("  Plátano ") == "platano"
    assert plain("Champiñón  laminado") == "champinon laminado"
    assert plain(None) == ""


def test_singular_and_stems():
    assert [singular(w) for w in ("huevos", "eggs", "limones", "tomatoes", "arroz", "kiwi")] == \
        ["huevo", "egg", "limon", "tomato", "arroz", "kiwi"]
    assert stems("Pechuga de pollo con Champiñones") == {"pechuga", "pollo", "champinon"}


@pytest.mark.parametrize("name,key", [
    ("chicken breast", "chicken breast"), ("Chicken Breasts", "chicken breast"),
    ("pechuga de pollo", "chicken breast"), ("Pechugas de Pollo", "chicken breast"),
    ("huevos", "eggs"), ("egg", "eggs"), ("Champiñón", "mushrooms"), ("champiñones", "mushrooms"),
    ("plátano", "banana"), ("fresón", "strawberries"), ("fresa", "strawberries"), ("jengibre molido", "ground ginger"),
    ("tomates", "tomato"), ("limones", "lemon"), ("yogur griego 0%", "greek yogurt 0%"),
    ("Greek yogurt 0 %", "greek yogurt 0%"), ("brócoli congelado", "frozen broccoli"), ("brocoli", "broccoli"),
    ("salmón congelado", "frozen salmon"), ("feta cheese", "feta"), ("coles de bruselas", "brussels sprouts"),
])
def test_canonical_resolves_spanish_english_accents_and_plurals(name, key):
    assert canonical(name) == key


@pytest.mark.parametrize("name", ["dragon fruit", "", "pollo", "chickpeas", "canned tuna", "lentils"])
def test_canonical_is_none_for_unknown_or_unclear_names(name):
    # "chickpeas" could be canned or dried (very different macros): no guess, the caller sees an unknown food
    assert canonical(name) is None


def test_no_name_points_to_two_foods():
    assert ambiguous() == []


def test_every_key_is_english_plain_and_maps_to_itself():
    keys = foods()
    assert len(keys) == len(set(keys))
    for key in keys:
        assert key == plain(key) and key.isascii(), key
        assert canonical(key) == key, key


def test_aliases_point_to_keys_and_agree_on_frozen():
    keys = set(foods())
    frozen = lambda name: "frozen" in name or "congelad" in name
    for alias, key in pairs():
        assert key in keys, alias
        assert alias not in keys, alias
        assert frozen(alias) == frozen(key), alias  # a fresh name never resolves to a frozen record
    assert aliases()["pechuga de pollo"] == "chicken breast"
    assert aliases_of("strawberries") == ["fresas", "freson"]


def test_every_alias_resolves_to_its_key():
    assert all(canonical(alias) == key for alias, key in pairs())
    assert {"pechuga de pollo", "garbanzos cocidos", "atun claro al natural lata", "yogur griego 0%"} <= set(aliases())


def test_aliases_file_lists_every_food_of_the_data():
    assert set(foods()) == set(NUTRITION) | set(PACKS)
    assert json.loads(ALIASES.read_text(encoding="utf-8"))["foods"] == foods()


def test_every_food_has_nutrition_and_pack_entry():
    no_pack = sorted(set(NUTRITION) - set(PACKS))
    no_nutrition = sorted(set(PACKS) - set(NUTRITION))
    assert no_pack == [], f"in per-100g.json, not in packs.json: {no_pack}"
    # Left out of the nutrition table on purpose (data/build/nutrition-map.json "dropped"):
    # frozen salmon (no frozen record in Ciqual or USDA). Whey has a USDA record since 2026-10-19.
    assert no_nutrition == sorted(DROPPED) == ["frozen salmon"], no_nutrition


def test_photo_names_cover_every_food():
    assert set(load("english-names.json")["names"]) == set(foods())
