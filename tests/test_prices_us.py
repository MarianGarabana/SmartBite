"""Estimated prices for the United States (decided 2026-11-03): BLS Average Price Data (U.S. city average) from the
public API v1, mean of the months with data in the latest 12, exact and close matches only, in USD. Fruits and
vegetables the BLS does not price (added 2026-11-21): USDA ERS Fruit and Vegetable Prices, the 2023 price moved to the
same period with the CPI index of its group. Same engine path as Spain, Canada and the UK."""
import csv
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
CPI = ROOT / "data" / "raw" / "bls" / "cpi.json"
ERS = ROOT / "data" / "raw" / "ers"
US = load_estimates("US")
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"
FRITTATA = "tuna-frittata-with-vegetables"
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_us", ROOT / "data" / "build" / "build_prices_us.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not (RAW.exists() and CPI.exists() and ERS.exists()),
                               reason="BLS series or ERS files not downloaded (data/raw is gitignored)")
PERIOD = [f"2025-{m:02d}" for m in (11, 12)] + [f"2026-{m:02d}" for m in range(1, 11)]


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}


def by_food(meal):
    return {l["food"]: l for l in meal["evaluation"]["pack"]["lines"]}


def pack_size(line):
    return line["grams_bought"] / line["packs_to_buy"]


def test_mapping_covers_every_food_with_a_bls_series_or_an_ers_item():
    assert set(MAP) == set(PACKS)
    for food, m in MAP.items():
        assert m["match"] in ("exact", "close", "broad", "none"), food
        if m["match"] in ("exact", "close"):
            assert ("series" in m) != ("ers" in m), food
            assert sum(k in m for k in ("per", "grams", "litres", "eggs")) == 1, food
        if "series" in m:
            assert m["series"].startswith("APU0000"), food
        if "ers" in m:
            assert m["ers"]["group"] in bp.ERS_FILES and m["cpi"].startswith("CUUR0000SEF"), food
            assert m["grams"] == 453.6, food
        if m["match"] != "exact":
            assert m["note"], food


def test_fresh_and_frozen_use_their_own_ers_form_and_cpi_group():
    for food, m in MAP.items():
        if "ers" not in m:
            continue
        form = m["ers"]["form"]
        assert (form == "Frozen") == food.startswith("frozen "), food
        if form == "Canned":
            assert food.startswith("canned ") or food in ("crushed tomatoes", "artichoke hearts"), food
        expected = {"Frozen": "CUUR0000SEFM02", "Canned": "CUUR0000SEFM01", "Dried": "CUUR0000SEFM03"}.get(
            form, "CUUR0000SEFK" if m["ers"]["group"] == "fruits" else "CUUR0000SEFL")
        assert m["cpi"] == expected, food


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(US["foods"]) == priced and len(priced) == 53
    assert sum(r["source"] == "USDA ERS" for r in US["foods"].values()) == 34
    assert US["country"] == "US" and US["currency"] == "USD" and US["months"] == 12
    assert (US["period_from"], US["period_to"]) == ("2025-11", "2026-10")
    for food, rec in US["foods"].items():
        assert bp.MIN_MONTHS <= rec["months"] <= 12, food
        assert ("price_per_unit_eur" in rec) == (food == "eggs"), food
        assert rec["source"] == ("USDA ERS" if "ers" in MAP[food] else "BLS"), food


def test_sources_note_cites_the_bls_and_the_ers():
    text = " ".join((ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8").split())
    assert "Average Price Data" in text and "November 2025 to October 2026" in text
    assert "Fruit and Vegetable Prices" in text and "CC0" in text and "Circana" in text


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
    months = set(PERIOD)

    def mean(sid):
        vals = [float(d["value"]) for d in raw[sid]
                if f"{d['year']}-{d['period'][1:]}" in months and d["value"] not in ("-", "")]
        return sum(vals) / len(vals)

    assert US["foods"]["sugar"]["price_per_kg_eur"] == pytest.approx(mean("APU0000715211") / 0.4536, abs=5e-4)
    assert US["foods"]["eggs"]["price_per_unit_eur"] == pytest.approx(mean("APU0000708111") / 12, abs=5e-5)
    assert US["foods"]["chicken breast"]["price_per_kg_eur"] == pytest.approx(mean("APU0000FF1101") / 0.4536, abs=5e-4)
    assert US["foods"]["strawberries"]["price_per_kg_eur"] == pytest.approx(mean("APU0000711415") / 0.3402, abs=5e-4)
    milk = US["foods"]["semi-skimmed milk"]
    assert milk["price_per_litre_eur"] == pytest.approx(mean("APU0000FJ1101") / 3.785, abs=5e-4)


@needs_raw
def test_ers_prices_match_the_raw_files_by_hand():
    cpi = json.loads(CPI.read_text(encoding="utf-8"))["series"]

    def index(sid, months):
        vals = [float(d["value"]) for d in cpi[sid] if f"{d['year']}-{d['period'][1:]}" in months
                and d["value"] not in ("-", "")]
        return sum(vals) / len(vals)

    def ers(name, item, form):
        with open(ERS / name, encoding="utf-8-sig", newline="") as f:
            return next(float(r["AverageRetailPrice"]) for r in csv.DictReader(f)
                        if list(r.values())[0] == item and r["Form"] == form)

    y2023 = {f"2023-{m:02d}" for m in range(1, 13)}
    for food, name, item, form, sid in [
            ("avocado", "all-vegetables-average-prices.csv", "Avocados", "Fresh", "CUUR0000SEFL"),
            ("apple", "all-fruits-average-prices.csv", "Apples", "Fresh", "CUUR0000SEFK"),
            ("frozen peas", "all-vegetables-average-prices.csv", "Green peas", "Frozen", "CUUR0000SEFM02"),
            ("dried lentils", "all-vegetables-average-prices.csv", "Lentils", "Dried", "CUUR0000SEFM03"),
            ("canned red kidney beans", "all-vegetables-average-prices.csv", "Kidney beans", "Canned", "CUUR0000SEFM01")]:
        factor = index(sid, set(PERIOD)) / index(sid, y2023)
        assert US["foods"][food]["price_per_kg_eur"] == pytest.approx(ers(name, item, form) * factor / 0.4536,
                                                                      abs=5e-4), food


def test_us_estimates_price_the_packs_in_usd():
    est = evaluate(**demo(TUNA), country="US")
    for food, line in by_food(est).items():
        rec = US["foods"].get(food)
        if line.get("optional"):
            continue
        if rec is None:
            assert line["has_price"] is False, food
            continue
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-11/2026-10", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "US" and src["currency"] == "USD" and "Bureau of Labor Statistics" in src["source"]
    assert "Economic Research Service" in src["source"]


def test_api_country_us_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(FRITTATA), "country": "US"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    eggs = by_food(data)["eggs"]
    assert eggs["cost_bought_eur"] == round_price(US["foods"]["eggs"]["price_per_unit_eur"] * eggs["units_bought"])
