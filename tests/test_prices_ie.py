"""Estimated prices for Ireland (decided 2026-11-03): CSO table CPM12 (National Average Price), mean of the latest 12
monthly prices, exact and close matches only, in EUR. Same engine path as the other countries."""
import importlib.util
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.contracts import validate_output
from smartbite_engine.estimated_prices import load_estimates, round_price
from smartbite_engine.meal import evaluate

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "web" / "demo" / "meals"
MAP = json.loads((ROOT / "data" / "build" / "prices-map-ie.json").read_text(encoding="utf-8"))["foods"]
PACKS = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
RAW = ROOT / "data" / "raw" / "cso" / "CPM12.json"
IE = load_estimates("IE")
FRITTATA = "tuna-frittata-with-vegetables"
STEW = "classic-lentil-stew-with-chickpeas-and-chicken"  # carrot, onion and tinned tomatoes have a CSO price
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_ie", ROOT / "data" / "build" / "build_prices_ie.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="CSO table not downloaded (data/raw is gitignored)")


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}


def by_food(meal):
    return {l["food"]: l for l in meal["evaluation"]["pack"]["lines"]}


def pack_size(line):
    return line["grams_bought"] / line["packs_to_buy"]


def test_mapping_names_smartbite_foods_with_one_size_each():
    for food, m in MAP.items():
        assert food in PACKS, food
        assert m["match"] in ("exact", "close", "broad"), food
        assert sum(k in m for k in ("per", "grams", "litres", "eggs")) == 1, food
        if m["match"] != "exact":
            assert m["note"], food


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(IE["foods"]) == priced and len(priced) == 17
    assert IE["country"] == "IE" and IE["currency"] == "EUR" and IE["months"] == 12
    assert (IE["period_from"], IE["period_to"]) == ("2025-10", "2026-09")
    for food, rec in IE["foods"].items():
        assert rec["months"] == 12, food
        assert ("price_per_unit_eur" in rec) == (food == "eggs"), food


def test_sources_note_cites_the_cso_and_the_period():
    text = " ".join((ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8").split())
    assert "CPM12" in text and "CC BY 4.0" in text and "October 2025 to September 2026" in text


@needs_raw
def test_build_reproduces_the_committed_table():
    built = bp.build()
    assert {k: v for k, v in built.items() if k != "built"} == {k: v for k, v in IE.items() if k != "built"}


@needs_raw
def test_prices_match_the_raw_table_by_hand():
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    times = list(raw["dimension"]["TLIST(M1)"]["category"]["index"])
    dim = raw["id"][2]
    cat = raw["dimension"][dim]["category"]
    codes = list(cat["index"])

    def mean(label):
        i = next(n for n, c in enumerate(codes) if cat["label"][c] == label)
        vals = [raw["value"][t * len(codes) + i] for t in range(len(times) - 12, len(times))]
        assert None not in vals
        return sum(vals) / 12

    assert times[-1] == "202609"
    assert IE["foods"]["eggs"]["price_per_unit_eur"] == pytest.approx(mean("Medium eggs per half dozen") / 6, abs=5e-5)
    assert IE["foods"]["salmon"]["price_per_kg_eur"] == pytest.approx(mean("Fresh salmon per kg"), abs=5e-4)
    assert IE["foods"]["potato"]["price_per_kg_eur"] == pytest.approx(mean("Potatoes 2.5 kg") / 2.5, abs=5e-4)
    assert IE["foods"]["macaroni"]["price_per_kg_eur"] == pytest.approx(mean("Spaghetti per 500g") / 0.5, abs=5e-4)


def test_ireland_estimates_price_the_packs_in_eur():
    est = evaluate(**demo(STEW), country="IE")
    lines = by_food(est)
    assert lines["dried lentils"]["has_price"] is False  # the CSO has no legumes
    priced = 0
    for food, line in lines.items():
        rec = IE["foods"].get(food)
        if line.get("optional") or rec is None:
            continue
        priced += 1
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-10/2026-09", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    assert priced == 3
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "IE" and src["currency"] == "EUR" and src["source"].startswith("CSO")


def test_api_country_ie_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(FRITTATA), "country": "IE"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    eggs = by_food(data)["eggs"]
    assert eggs["cost_bought_eur"] == round_price(IE["foods"]["eggs"]["price_per_unit_eur"] * eggs["units_bought"])
