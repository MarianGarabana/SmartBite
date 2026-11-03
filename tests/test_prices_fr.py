"""Estimated prices for France (2026-11-03): INSEE IPC-PM-2015 (Prix moyens de vente de détail, metropolitan France),
mean of the latest 12 monthly prices, exact and close matches only, in EUR, fresh foods only. Same engine path as the
other countries."""
import importlib.util
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.contracts import validate_output
from smartbite_engine.estimated_prices import load_estimates, round_price
from smartbite_engine.meal import evaluate

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "web" / "demo" / "meals"
MAP = json.loads((ROOT / "data" / "build" / "prices-map-fr.json").read_text(encoding="utf-8"))["foods"]
PACKS = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
RAW = ROOT / "data" / "raw" / "insee" / "IPC-PM-2015.xml"
FR = load_estimates("FR")
OVEN = "oven-baked-chicken-with-zucchini-and-orange"  # zucchini, orange, potato and onion have an INSEE price
BOWL = "chicken-breast-bowl-with-rice-and-vegetables"  # avocado (priced per piece) and red bell pepper
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_fr", ROOT / "data" / "build" / "build_prices_fr.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="INSEE file not downloaded (data/raw is gitignored)")


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
        assert m.get("per") in ("kg", "each") and not any(k in m for k in ("grams", "litres", "eggs")), food
        assert m["idbank"].isdigit() and len(m["idbank"]) == 9, food
        assert m["product"].endswith("(1 kg)" if m["per"] == "kg" else "(pièce)"), food
        if m["match"] != "exact":
            assert m["note"], food
    # fresh never stands for frozen
    assert all(MAP[f]["match"] == "broad" for f in MAP if f.startswith("frozen "))


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(FR["foods"]) == priced and len(priced) == 16
    assert sum(MAP[f]["match"] == "exact" for f in priced) == 13
    assert FR["country"] == "FR" and FR["currency"] == "EUR" and FR["months"] == 12
    assert (FR["period_from"], FR["period_to"]) == ("2025-10", "2026-09")
    for food, rec in FR["foods"].items():
        assert rec["months"] == 12, food
        assert rec["insee_idbank"] == MAP[food]["idbank"] and rec["insee_series"] == MAP[food]["product"], food
        assert "price_per_unit_eur" not in rec, food
        assert ("price_each" in rec) == (MAP[food]["per"] == "each"), food


def test_sources_note_cites_insee_the_licence_and_the_period():
    text = " ".join((ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8").split())
    assert "IPC-PM-2015" in text and "Licence Ouverte / Open Licence 2.0" in text and "Source : Insee" in text
    assert "October 2025 to September 2026" in text and "fresh foods only" in text.lower()


@needs_raw
def test_build_reproduces_the_committed_table():
    built = bp.build()
    assert {k: v for k, v in built.items() if k != "built"} == {k: v for k, v in FR.items() if k != "built"}


@needs_raw
def test_map_titles_match_the_raw_series():
    series = bp.read_series()
    for food, m in MAP.items():
        s = series[m["idbank"]]
        assert s["title"] == m["product"] and s["freq"] == "M" and not s["stopped"], food


@needs_raw
def test_prices_match_the_raw_file_by_hand():
    months = [f"2025-{m}" for m in ("10", "11", "12")] + [f"2026-{m:02d}" for m in range(1, 10)]
    obs = {}
    for el in ET.parse(RAW).getroot().iter():
        if el.tag.endswith("Series") and el.get("FREQ") == "M":
            obs[el.get("IDBANK")] = {o.get("TIME_PERIOD"): o.get("OBS_VALUE") for o in el}

    def mean(idbank):
        vals = [float(obs[idbank][m]) for m in months]  # all 12 months present, none NaN
        return sum(vals) / 12

    assert FR["foods"]["tomato"]["price_per_kg_eur"] == pytest.approx(mean("000641429"), abs=5e-4)
    assert FR["foods"]["potato"]["price_per_kg_eur"] == pytest.approx(mean("000641360"), abs=5e-4)
    assert FR["foods"]["beef steak"]["price_per_kg_eur"] == pytest.approx(mean("000442433"), abs=5e-4)
    avocado = FR["foods"]["avocado"]
    assert avocado["price_each"] == pytest.approx(mean("001791255"), abs=5e-4)
    assert avocado["price_per_kg_eur"] == pytest.approx(mean("001791255") / 0.136, abs=5e-3)


def test_france_estimates_price_the_packs_in_eur():
    est = evaluate(**demo(OVEN), country="FR")
    lines = by_food(est)
    priced = 0
    for food, line in lines.items():
        rec = FR["foods"].get(food)
        if line.get("optional") or rec is None:
            assert line.get("price_source") != "estimate" or line.get("optional"), food
            continue
        priced += 1
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-10/2026-09", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    assert priced == 4
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "FR" and src["currency"] == "EUR" and src["source"].startswith("INSEE")


def test_api_country_fr_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(BOWL), "country": "FR"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    avocado = by_food(data)["avocado"]
    one = round_price(FR["foods"]["avocado"]["price_per_kg_eur"] * pack_size(avocado) / 1000)
    assert pack_size(avocado) == 136 and one == 1.5
    assert avocado["price_source"] == "estimate" and avocado["cost_bought_eur"] == pytest.approx(one * avocado["packs_to_buy"])
