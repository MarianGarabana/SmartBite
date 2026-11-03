"""Estimated prices for the United States (decided 2026-11-03): BLS Average Price Data (U.S. city average) from the
public API v1, mean of the months with data in the latest 12 (October 2025 has none), exact and close matches only, in
USD. Same engine path as Spain, Canada and the UK."""
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
MAP = json.loads((ROOT / "data" / "build" / "prices-map-us.json").read_text(encoding="utf-8"))["foods"]
PACKS = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
RAW = ROOT / "data" / "raw" / "bls" / "ap.json"
US = load_estimates("US")
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"
FRITTATA = "tuna-frittata-with-vegetables"
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_us", ROOT / "data" / "build" / "build_prices_us.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="BLS series not downloaded (data/raw is gitignored)")


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
        assert m["series"].startswith("APU0000"), food
        assert sum(k in m for k in ("per", "grams", "litres", "eggs")) == 1, food
        if m["match"] != "exact":
            assert m["note"], food


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(US["foods"]) == priced and len(priced) == 18
    assert US["country"] == "US" and US["currency"] == "USD" and US["months"] == 12
    assert (US["period_from"], US["period_to"]) == ("2025-10", "2026-09")
    for food, rec in US["foods"].items():
        assert bp.MIN_MONTHS <= rec["months"] <= 11, food  # October 2025 has no data
        assert ("price_per_unit_eur" in rec) == (food == "eggs"), food


def test_sources_note_cites_the_bls_and_the_gap():
    text = " ".join((ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8").split())
    assert "Average Price Data" in text and "October 2025 to September 2026" in text
    assert "2025 lapse in appropriations" in text


def test_period_counts_months_with_no_data():
    prices = {"A": {"2026-09": 1.0, "2026-01": 1.0}}
    assert bp.period(prices) == [f"2025-{m:02d}" for m in (10, 11, 12)] + [f"2026-{m:02d}" for m in range(1, 10)]


@needs_raw
def test_build_reproduces_the_committed_table():
    built = bp.build()
    assert {k: v for k, v in built.items() if k != "built"} == {k: v for k, v in US.items() if k != "built"}


@needs_raw
def test_prices_match_the_raw_series_by_hand():
    raw = json.loads(RAW.read_text(encoding="utf-8"))["series"]
    months = {f"2025-{m:02d}" for m in (10, 11, 12)} | {f"2026-{m:02d}" for m in range(1, 10)}

    def mean(sid):
        vals = [float(d["value"]) for d in raw[sid]
                if f"{d['year']}-{d['period'][1:]}" in months and d["value"] not in ("-", "")]
        return sum(vals) / len(vals)

    oct25 = next(d for d in raw["APU0000708111"] if d["year"] == "2025" and d["period"] == "M10")
    assert oct25["value"] == "-"
    assert US["foods"]["eggs"]["price_per_unit_eur"] == pytest.approx(mean("APU0000708111") / 12, abs=5e-5)
    assert US["foods"]["chicken breast"]["price_per_kg_eur"] == pytest.approx(mean("APU0000FF1101") / 0.4536, abs=5e-4)
    assert US["foods"]["strawberries"]["price_per_kg_eur"] == pytest.approx(mean("APU0000711415") / 0.3402, abs=5e-4)
    milk = US["foods"]["semi-skimmed milk"]
    assert milk["price_per_litre_eur"] == pytest.approx(mean("APU0000FJ1101") / 3.785, abs=5e-4)


def test_us_estimates_price_the_packs_in_usd():
    est = evaluate(**demo(TUNA), country="US")
    for food, line in by_food(est).items():
        rec = US["foods"].get(food)
        if line.get("optional"):
            continue
        if rec is None:
            assert line["has_price"] is False, food
            continue
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-10/2026-09", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "US" and src["currency"] == "USD" and "Bureau of Labor Statistics" in src["source"]


def test_api_country_us_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(FRITTATA), "country": "US"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    eggs = by_food(data)["eggs"]
    assert eggs["cost_bought_eur"] == round_price(US["foods"]["eggs"]["price_per_unit_eur"] * eggs["units_bought"])
