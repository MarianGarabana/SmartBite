import json
import re
from pathlib import Path

import pytest

from smartbite_engine.contracts import validate_output
from smartbite_engine.meal import evaluate

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "web" / "demo" / "meals"
PUBLIC = ROOT / "web" / "public"
FILES = sorted(DEMO.glob("*.json"))

# Fields of the personal app that hold store or session data
STORE_KEYS = {"counts", "live_session", "auto_matched", "attempts", "match_source", "match_reason", "needs_match",
              "ean", "barcode", "link", "price_eur", "price_per_kg_eur", "request_id", "run", "label", "other_options"}
# Personal and store words, stored reversed so this file never spells them
BANNED = re.compile(r"\b(" + "|".join(w[::-1] for w in ("nairam", "dirdam", "opmacla", "nahcua", "acdeb", "eciffo",
                                                           "anicifo", "reh", "klub", "anirrat")) + r")\b", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def walk(value, path="meal"):
    if isinstance(value, dict):
        for k, v in value.items():
            yield f"{path}.{k}", k, v
            yield from walk(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, f"{path}[{i}]")


def test_there_are_13_demo_meals():
    assert len(FILES) == 13


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_demo_meal_is_valid(path):
    meal = load(path)
    assert validate_output(meal, "meal.schema.json") == []
    assert meal["slug"] == path.stem and meal["demo"] is True and not meal.get("fixture")
    assert meal["photo"] == f"/demo/images/{path.stem}.jpg" and meal["photo_ai_generated"] is True
    assert (PUBLIC / meal["photo"].lstrip("/")).is_file()


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_demo_meal_has_no_store_fields(path):
    meal = load(path)
    # micros nutrients name themselves with "label" (e.g. "Iron"): not a store label
    keys = {k for path, k, _ in walk(meal) if not path.startswith("meal.evaluation.macros.micros.nutrients[")}
    assert not keys & STORE_KEYS
    strings = [v for _, _, v in walk(meal) if isinstance(v, str)]
    assert not [s for s in strings if "http" in s or "www." in s]
    for line in meal["evaluation"]["pack"]["lines"]:
        assert line["has_price"] is False and line["product_url"] is None and line["price_date"] is None
        assert line["cost_bought_eur"] is None and line.get("price_source") in (None, "typical")
    assert {l["source"] for l in meal["evaluation"]["macros"]["lines"]} <= {"ciqual", "usda"}


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_demo_meal_has_no_personal_words(path):
    text = path.read_text(encoding="utf-8")
    assert not BANNED.findall(text)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_demo_meal_uses_english_food_keys_and_matches_the_engine(path):
    meal = load(path)
    assert meal["evaluation"]["macros"]["unresolved"] == []
    assert all(i["food"] == i["name"] for i in meal["evaluation"]["items"])
    fresh = evaluate(meal["form"], meal["picked_idea"], meal["recipe"])
    assert fresh["evaluation"] == meal["evaluation"] and "mfp" not in fresh and "mfp" not in meal
