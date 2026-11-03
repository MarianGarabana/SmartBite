"""Estimated prices for the United Kingdom (decided 2026-11-03): ONS Shopping prices comparison tool, mean of the latest
12 monthly average prices, exact and close matches only, in GBP. Same engine path as Spain and Canada."""
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
MAP = json.loads((ROOT / "data" / "build" / "prices-map-gb.json").read_text(encoding="utf-8"))["foods"]
PACKS = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
RAW = ROOT / "data" / "raw" / "ons" / "datadownload.xlsx"
GB = load_estimates("GB")
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"
FRITTATA = "tuna-frittata-with-vegetables"
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_gb", ROOT / "data" / "build" / "build_prices_gb.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="ONS file not downloaded (data/raw is gitignored)")


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
        if m.get("per") == "each":
            assert PACKS[food]["sold_by"] == "per_kg", food


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(GB["foods"]) == priced and len(priced) == 50
    assert GB["country"] == "GB" and GB["currency"] == "GBP" and GB["months"] == 12
    assert (GB["period_from"], GB["period_to"]) == ("2025-10", "2026-09")
    assert "red bell pepper" not in GB["foods"]  # ONS "Peppers, each" looks like multipacks
    for food, rec in GB["foods"].items():
        assert rec["months"] == 12, food
        assert ("price_per_unit_eur" in rec) == (food == "eggs"), food


def test_sources_note_cites_the_ons_and_the_period():
    text = " ".join((ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8").split())
    assert "Open Government Licence v.3.0" in text and "Shopping prices comparison tool" in text
    assert "October 2025 to September 2026" in text


def test_size_text_matches_ons_weight_sizes():
    assert bp.size_text({"per": "kg"}) == "1000 g"
    assert bp.size_text({"per": "each"}) == "each"
    assert bp.size_text({"eggs": 12}) == "12 pack"
    assert bp.size_text({"litres": 1.136}) == "1136 ml"
    assert bp.size_text({"grams": 400}) == "400 g"


@needs_raw
def test_build_reproduces_the_committed_table():
    built = bp.build()
    assert {k: v for k, v in built.items() if k != "built"} == {k: v for k, v in GB.items() if k != "built"}


@needs_raw
def test_prices_match_the_raw_sheet_by_hand():
    prices, sizes = bp.read_table()
    months = [f"2025-{m:02d}" for m in (10, 11, 12)] + [f"2026-{m:02d}" for m in range(1, 10)]

    def mean(item):
        return sum(prices[item][m] for m in months) / 12

    assert sizes["Eggs - free-range"] == "12 pack"
    assert GB["foods"]["eggs"]["price_per_unit_eur"] == pytest.approx(mean("Eggs - free-range") / 12, abs=5e-5)
    assert GB["foods"]["salmon"]["price_per_kg_eur"] == pytest.approx(mean("Fish - fresh salmon"), abs=5e-4)
    assert GB["foods"]["peanut butter"]["price_per_kg_eur"] == pytest.approx(mean("Peanut butter") / 0.3, abs=5e-4)
    assert GB["foods"]["lemon"]["price_each"] == pytest.approx(mean("Lemons"), abs=1e-3)


def test_build_stops_when_a_size_changes(tmp_path):
    mapping = tmp_path / "map.json"
    mapping.write_text(json.dumps({"foods": {
        "peanut butter": {"match": "exact", "product": "Peanut butter", "grams": 340, "note": ""}}}))
    if not RAW.exists():
        pytest.skip("ONS file not downloaded")
    with pytest.raises(SystemExit, match="sold as '300 g', the map says '340 g'"):
        bp.build(map_path=mapping)


def test_uk_estimates_price_the_packs_in_gbp():
    est = evaluate(**demo(TUNA), country="GB")
    for food, line in by_food(est).items():
        rec = GB["foods"].get(food)
        if line.get("optional"):
            continue
        if rec is None:
            assert line["has_price"] is False, food
            continue
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-10/2026-09", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "GB" and src["currency"] == "GBP" and src["source"].startswith("ONS")


def test_api_country_gb_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(FRITTATA), "country": "GB"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    eggs = by_food(data)["eggs"]
    assert eggs["cost_bought_eur"] == round_price(GB["foods"]["eggs"]["price_per_unit_eur"] * eggs["units_bought"])
