"""Estimated prices for Canada (decided 2026-11-03): Statistics Canada table 18-10-0245-01, mean of the latest 12
monthly average retail prices, exact and close matches only, in CAD. Same engine path as Spain: lines the user did not
price get price per kg x pack weight (eggs: per egg x count), rounded to 0.05; the user's price wins."""
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
MAP = json.loads((ROOT / "data" / "build" / "prices-map-ca.json").read_text(encoding="utf-8"))["foods"]
PACKS = json.loads((ROOT / "data" / "open" / "packs" / "packs.json").read_text(encoding="utf-8"))["foods"]
RAW = ROOT / "data" / "raw" / "statcan" / "18100245.csv"
CA = load_estimates("CA")
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"
FRITTATA = "tuna-frittata-with-vegetables"
SIZES = ("per", "grams", "litres", "eggs")
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_ca", ROOT / "data" / "build" / "build_prices_ca.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="Statistics Canada table not downloaded (data/raw is gitignored)")


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}


def by_food(meal):
    return {l["food"]: l for l in meal["evaluation"]["pack"]["lines"]}


def pack_size(line):
    return line["grams_bought"] / line["packs_to_buy"]


# --- data files ---

def test_mapping_names_smartbite_foods_with_one_size_each():
    for food, m in MAP.items():
        assert food in PACKS, food
        assert m["match"] in ("exact", "close", "broad"), food
        assert m["product"], food
        assert sum(k in m for k in SIZES) == 1, food
        assert m.get("per") in (None, "kg", "each"), food
        if m["match"] != "exact":
            assert m["note"], food
        if m.get("per") == "each":
            assert PACKS[food]["sold_by"] == "per_kg", food  # one piece = the SmartBite loose unit


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(CA["foods"]) == priced and len(priced) == 53
    assert CA["country"] == "CA" and CA["currency"] == "CAD" and CA["months"] == 12
    assert (CA["period_from"], CA["period_to"]) == ("2025-09", "2026-08")
    assert "regions" not in CA
    for food, rec in CA["foods"].items():
        assert rec["months"] >= bp.MIN_MONTHS, food
        assert ("price_per_unit_eur" in rec) == (food == "eggs"), food
        assert rec.get("price_per_kg_eur", 1) > 0, food


def test_sources_note_cites_statistics_canada_and_the_period():
    text = (ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8")
    assert "18-10-0245-01" in text and "Statistics Canada Open Licence" in text
    assert "September 2025 to August 2026" in text


@needs_raw
def test_build_reproduces_the_committed_table():
    built = bp.build(today=None)
    assert {k: v for k, v in built.items() if k != "built"} == {k: v for k, v in CA.items() if k != "built"}


@needs_raw
def test_prices_match_the_raw_table_by_hand():
    """Recomputed here without the builder: the mean of the 12 monthly prices, then per kg or per egg."""
    rows = {}
    with open(RAW, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["GEO"] == "Canada" and r["VALUE"]:
                rows.setdefault(r["Products"], {})[r["REF_DATE"]] = float(r["VALUE"])
    months = [f"2025-{m:02d}" for m in range(9, 13)] + [f"2026-{m:02d}" for m in range(1, 9)]

    def mean(product):
        vals = [rows[product][m] for m in months]
        assert len(vals) == 12
        return sum(vals) / 12

    assert CA["foods"]["chicken breast"]["price_per_kg_eur"] == pytest.approx(mean("Chicken breasts, per kilogram"), abs=5e-4)
    assert CA["foods"]["eggs"]["price_per_unit_eur"] == pytest.approx(mean("Eggs, 1 dozen") / 12, abs=5e-5)
    assert CA["foods"]["canned tuna in water"]["price_per_kg_eur"] == pytest.approx(mean("Canned tuna, 170 grams") / 0.170, abs=5e-4)
    assert CA["foods"]["lemon"]["price_each"] == pytest.approx(mean("Lemons, unit"), abs=5e-4)
    soy = CA["foods"]["soy milk"]
    assert soy["price_per_litre_eur"] == pytest.approx(mean("Soy milk, 1.89 litres") / 1.89, abs=5e-4)
    assert soy["price_per_kg_eur"] == pytest.approx(soy["price_per_litre_eur"] / soy["grams_per_ml"], abs=5e-3)


def test_build_refuses_a_product_with_too_few_months(tmp_path):
    raw = tmp_path / "t.csv"
    head = '"REF_DATE","GEO","Products","UOM","VECTOR","VALUE"\n'
    lines = [f'"2026-{m:02d}","Canada","Eggs, 1 dozen","Dollars","v1","4.80"' for m in range(1, 13)]
    lines += [f'"2026-{m:02d}","Canada","Chicken breasts, per kilogram","Dollars","v2","14.00"' for m in range(1, 9)]
    raw.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
    mapping = tmp_path / "map.json"
    mapping.write_text(json.dumps({"foods": {
        "eggs": {"match": "exact", "product": "Eggs, 1 dozen", "eggs": 12, "note": ""},
        "chicken breast": {"match": "exact", "product": "Chicken breasts, per kilogram", "per": "kg", "note": ""}}}))
    with pytest.raises(SystemExit, match="chicken breast.*8 of 12"):
        bp.build(raw=raw, map_path=mapping)
    mapping.write_text(json.dumps({"foods": {
        "eggs": {"match": "exact", "product": "Eggs, 1 dozen", "eggs": 12, "note": ""}}}))
    out = bp.build(raw=raw, map_path=mapping)
    assert out["foods"]["eggs"]["price_per_unit_eur"] == 0.4 and out["period_from"] == "2026-01"


# --- engine and API ---

def test_canada_estimates_price_the_packs_in_cad():
    est = evaluate(**demo(TUNA), country="CA")
    lines = by_food(est)
    for food, line in lines.items():
        rec = CA["foods"].get(food)
        if line.get("optional"):
            continue
        if rec is None:
            assert line["has_price"] is False, food
            continue
        assert line["price_source"] == "estimate" and line["price_period"] == "2025-09/2026-08", food
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    src = est["evaluation"]["pack"]["estimate_source"]
    assert src["country"] == "CA" and src["currency"] == "CAD" and "Statistics Canada" in src["source"]
    assert "region" not in src


def test_canada_eggs_and_loose_pieces():
    eggs = by_food(evaluate(**demo(FRITTATA), country="CA"))["eggs"]
    assert eggs["cost_bought_eur"] == round_price(CA["foods"]["eggs"]["price_per_unit_eur"] * eggs["units_bought"])
    lemon = by_food(evaluate(**demo(TUNA), country="CA"))["lemon"]
    # One SmartBite lemon costs one Statistics Canada lemon
    assert lemon["cost_bought_eur"] == pytest.approx(round_price(CA["foods"]["lemon"]["price_each"]) * lemon["packs_to_buy"])


def test_api_country_ca_gives_estimates_and_a_valid_reply():
    r = client.post("/api/evaluate", json={**demo(FRITTATA), "country": "CA"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    assert data["evaluation"]["pack"]["prices_estimated"] is True


@pytest.mark.parametrize("extra", [{"country": "CA", "region": "ES-MD"}, {"country": "ca"}, {"country": "DE"}])
def test_api_rejects_a_spanish_region_in_canada_and_other_countries(extra):
    r = client.post("/api/evaluate", json={**demo(TUNA), **extra})
    assert r.status_code == 422
