"""Estimated prices for Spain (decision P28): MAPA household panel averages, only for exact and close matches.
Lines the user did not price get price per kg x pack weight (eggs: per egg x count), rounded to 0.05 EUR; the user's
price wins; without a country the reply is unchanged."""
import importlib.util
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.contracts import validate_output
from smartbite_engine.estimated_prices import load_estimates, pack_estimate, round_price
from smartbite_engine.meal import evaluate

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "web" / "demo" / "meals"
MAP = json.loads((ROOT / "data" / "build" / "prices-map-es.json").read_text(encoding="utf-8"))["foods"]
FOODS = json.loads((ROOT / "data" / "open" / "aliases.json").read_text(encoding="utf-8"))["foods"]
ES = load_estimates("ES")
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"
FRITTATA = "tuna-frittata-with-vegetables"
client = TestClient(app)

_spec = importlib.util.spec_from_file_location("build_prices_es", ROOT / "data" / "build" / "build_prices_es.py")
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}, meal


def by_food(meal):
    return {l["food"]: l for l in meal["evaluation"]["pack"]["lines"]}


def pack_size(line):
    return line["grams_bought"] / line["packs_to_buy"]


# --- data files ---

def test_mapping_covers_every_food_once():
    assert set(MAP) == set(FOODS)
    for food, m in MAP.items():
        assert m["match"] in ("exact", "close", "broad", "none"), food
        assert m["note"], food
        if m["match"] == "none":
            assert m["row"] is None and m["section"] is None, food
        else:
            assert m["row"] and m["section"] and m["unit"] in ("kg", "l", "unit"), food


def test_price_table_has_exact_and_close_foods_only():
    priced = {f for f, m in MAP.items() if m["match"] in ("exact", "close")}
    assert set(ES["foods"]) == priced and len(priced) == 76
    assert ES["country"] == "ES" and ES["currency"] == "EUR" and ES["months"] == 12
    assert (ES["period_from"], ES["period_to"]) == ("2025-08", "2026-07")
    for food, rec in ES["foods"].items():
        assert rec["match"] == MAP[food]["match"] and rec["mapa_row"] == MAP[food]["row"]
        assert rec["mapa_section"] == MAP[food]["section"]
        price = rec.get("price_per_unit_eur") if MAP[food]["unit"] == "unit" else rec.get("price_per_kg_eur")
        assert price and 0.05 < price < 60, food
        assert rec["months"] >= 6, food
    assert "price_per_unit_eur" in ES["foods"]["eggs"]


def test_sources_note_cites_mapa_and_the_period():
    text = (ROOT / "data" / "open" / "prices" / "SOURCES.md").read_text(encoding="utf-8")
    for needed in ("Panel de consumo alimentario en hogares", "Ley 37/2007", "August 2025 to July 2026",
                   "mapa.gob.es"):
        assert needed in text


# --- build script on a tiny workbook: rows repeat across sections, older row names, value / volume ---

def _xlsx(path, sheets):
    """Minimal XLSX with inline strings. sheets: {name: [[cell, ...], ...]} with columns A, B, ..."""
    cols = "ABCDEFG"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + "".join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(sheets, 1))
                   + "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/'
                   '2006/relationships">' + "".join(
                       f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1))
                   + "</Relationships>")
        for i, rows in enumerate(sheets.values(), 1):
            xml = []
            for r, row in enumerate(rows, 1):
                cells = []
                for c, v in zip(cols, row):
                    if v is None:
                        continue
                    if isinstance(v, str):
                        cells.append(f'<c r="{c}{r}" t="inlineStr"><is><t>{v}</t></is></c>')
                    else:
                        cells.append(f'<c r="{c}{r}"><v>{v}</v></c>')
                xml.append(f'<row r="{r}">{"".join(cells)}</row>')
            z.writestr(f"xl/worksheets/sheet{i}.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/'
                       'spreadsheetml/2006/main"><sheetData>' + "".join(xml) + "</sheetData></worksheet>")


HEAD = [["CONSUMO HOGARES"], ["MES", "T.ESPAÑA"],
        [None, "CONSUMO X CAPITA", "PENETRACION (%)", "GASTO X CAPITA", "PRECIO MEDIO kg ó litros",
         "VALOR (Miles Euros)", "VOLUMEN (Miles kg ó litros)"]]


def _row(name, value, volume):
    return [name, 1, 1, 1, None, value, volume]


def test_build_keys_on_section_and_row_and_weights_by_volume(tmp_path):
    new = HEAD + [_row(".TOTAL ALIMENTACION", 1, 1), _row("T.HORTALIZAS FRESCAS", 1, 1), _row("BROCOLI", 20, 10),
                  _row("VERD./HORT.CONGELAD", 1, 1), _row("BROCOLI", 99, 1), _row("TOTAL HUEVOS GALLINA", 30, 100),
                  _row("T.PESCADO/MARISCO CONSERVADO", 1, 1), _row("CONS.ATUN", 100, 10)]
    old = HEAD + [_row(".TOTAL ALIMENTACION", 1, 1), _row("T.HORTALIZAS FRESCAS", 1, 1), _row("BROCOLI", 40, 10),
                  _row("VERD./HORT.CONGELAD", 1, 1), _row("BROCOLI", 99, 1), _row("TOTAL HUEVOS GALLINA", 30, 100),
                  _row("CONS.PESCADO/MOLUSCO", 1, 1), _row("ATUN", 300, 10)]
    raw = tmp_path / "raw"
    raw.mkdir()
    _xlsx(raw / "a.xlsx", {f"{m} 2025": old for m in ("Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio")})
    _xlsx(raw / "b.xlsx", {f"{m} 2025": new for m in ("Julio", "Agosto", "Septiembre", "Octubre", "Noviembre",
                                                       "Diciembre")})
    mapping = {"broccoli": {"match": "exact", "section": "T.HORTALIZAS FRESCAS", "row": "BROCOLI", "unit": "kg"},
               "frozen broccoli": {"match": "exact", "section": "VERD./HORT.CONGELAD", "row": "BROCOLI", "unit": "kg"},
               "eggs": {"match": "exact", "section": ".TOTAL ALIMENTACION", "row": "TOTAL HUEVOS GALLINA",
                        "unit": "unit"},
               "canned tuna in water": {"match": "close", "section": "T.PESCADO/MARISCO CONSERVADO",
                                        "row": "CONS.ATUN", "unit": "kg",
                                        "alt": [{"section": "CONS.PESCADO/MOLUSCO", "row": "ATUN"}]},
               "kale": {"match": "broad", "section": "T.HORTALIZAS FRESCAS", "row": "BROCOLI", "unit": "kg"}}
    map_path = tmp_path / "map.json"
    map_path.write_text(json.dumps({"foods": mapping}), encoding="utf-8")
    packs = tmp_path / "packs.json"
    packs.write_text(json.dumps({"foods": {}}), encoding="utf-8")
    doc = bp.build(raw=raw, map_path=map_path, packs_path=packs)
    foods = doc["foods"]
    assert (doc["period_from"], doc["period_to"], doc["months"]) == ("2025-01", "2025-12", 12)
    assert set(foods) == {"broccoli", "frozen broccoli", "eggs", "canned tuna in water"}  # broad: no price
    assert foods["broccoli"]["price_per_kg_eur"] == pytest.approx((6 * 40 + 6 * 20) / 120)  # 3.0, fresh row
    assert foods["frozen broccoli"]["price_per_kg_eur"] == pytest.approx(99)
    assert foods["eggs"]["price_per_unit_eur"] == pytest.approx(0.3)
    assert foods["canned tuna in water"]["price_per_kg_eur"] == pytest.approx((6 * 300 + 6 * 100) / 120)
    assert all(r["months"] == 12 for r in foods.values())


def test_build_needs_twelve_consecutive_months(tmp_path):
    rows = HEAD + [_row(".TOTAL ALIMENTACION", 1, 1)]
    _xlsx(tmp_path / "a.xlsx", {"Enero 2025": rows, "Marzo 2025": rows})
    with pytest.raises(SystemExit, match="Only 2 months"):
        bp.latest_months(tmp_path)


# --- engine ---

@pytest.mark.parametrize("price, eur", [(1.024, 1.0), (1.026, 1.05), (0.01, 0.05), (2.5, 2.5)])
def test_round_price(price, eur):
    assert round_price(price) == eur


def test_pack_estimate_per_kg_and_per_egg():
    assert pack_estimate({"price_per_kg_eur": 9.844}, grams=168) == 1.65
    assert pack_estimate({"price_per_unit_eur": 0.2717}, units=24) == 6.5
    assert pack_estimate({"price_per_unit_eur": 0.2717}, grams=500) is None


def test_unknown_country_is_refused():
    with pytest.raises(ValueError, match="no estimated prices"):
        load_estimates("FR")


def test_estimates_price_the_packs_the_meal_buys_without_changing_them():
    body, meal = demo(TUNA)
    est = evaluate(**body, country="ES")
    plain = by_food(meal)
    for food, line in by_food(est).items():
        before = plain[food]
        assert (line.get("packs_to_buy"), line.get("grams_bought"), line.get("product_name")) == (
            before.get("packs_to_buy"), before.get("grams_bought"), before.get("product_name")), food
        rec = ES["foods"].get(food)
        if rec is None:
            assert line["has_price"] is False and line["price_source"] == "typical", food
            continue
        assert line["has_price"] is True and line["price_source"] == "estimate", food
        assert line["price_date"] == "2026-07" and line["price_period"] == "2025-08/2026-07"
        expected = round_price(rec["price_per_kg_eur"] * pack_size(line) / 1000)
        assert line["cost_bought_eur"] == pytest.approx(expected * line["packs_to_buy"]), food
    pack = est["evaluation"]["pack"]
    assert pack["prices_estimated"] is True
    assert pack["estimate_source"]["period_from"] == "2025-08" and pack["estimate_source"]["country"] == "ES"
    assert pack["unpriced"] == ["skyr"] and pack["budget_check_complete"] is False  # skyr is a broad match
    bought = [l for l in pack["lines"] if not l["optional"] and l["has_price"]]
    assert pack["cart_total_eur"] == pytest.approx(sum(l["cost_bought_eur"] for l in bought))


def test_eggs_are_estimated_per_egg():
    body, _ = demo(FRITTATA)
    eggs = by_food(evaluate(**body, country="ES"))["eggs"]
    assert eggs["units_bought"] == 24 and eggs["packs_to_buy"] == 1
    assert eggs["cost_bought_eur"] == round_price(ES["foods"]["eggs"]["price_per_unit_eur"] * 24)


def test_loose_item_estimate_is_for_the_unit():
    body, _ = demo(TUNA)
    lemon = by_food(evaluate(**body, country="ES"))["lemon"]
    # One lemon (58 g, the loose unit) at the price per kg
    unit_price = round_price(ES["foods"]["lemon"]["price_per_kg_eur"] * 58 / 1000)
    assert lemon["sold_by"] == "per_kg" and pack_size(lemon) == 58
    assert lemon["cost_bought_eur"] == pytest.approx(unit_price * lemon["packs_to_buy"])
    assert lemon["cost_used_eur"] == pytest.approx(lemon["grams_needed"] / 58 * unit_price)


def test_user_price_wins_over_the_estimate():
    body, _ = demo(TUNA)
    out = evaluate(**body, prices=[{"food": "lemon", "pack_grams": 58, "price_eur": 0.30}], country="ES")
    lines = by_food(out)
    assert lines["lemon"]["price_source"] == "user" and lines["lemon"]["cost_bought_eur"] == pytest.approx(0.30)
    assert lines["canned chickpeas"]["price_source"] == "estimate"
    assert out["evaluation"]["pack"]["prices_estimated"] is True


def test_all_user_prices_means_not_estimated():
    body, meal = demo(TUNA)
    prices = [{"food": l["food"], "pack_grams": pack_size(l), "price_eur": 1.0}
              for l in meal["evaluation"]["pack"]["lines"] if not l["optional"]]
    pack = evaluate(**body, prices=prices, country="ES")["evaluation"]["pack"]
    assert pack["prices_estimated"] is False and pack["budget_check_complete"] is True
    # Optional lines still show an estimate, but they are not in the budget
    assert by_food({"evaluation": {"pack": pack}})["salt"]["price_source"] == "estimate"


def test_without_country_nothing_changes():
    body, meal = demo(FRITTATA)
    out = evaluate(**body)
    assert out["evaluation"] == meal["evaluation"]
    assert "prices_estimated" not in out["evaluation"]["pack"]


# --- API ---

def test_api_country_es_gives_estimates_and_a_valid_reply():
    body, _ = demo(FRITTATA)
    r = client.post("/api/evaluate", json={**body, "country": "ES"})
    data = r.json()
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    pack = data["evaluation"]["pack"]
    assert pack["prices_estimated"] is True and pack["budget_check_complete"] is True
    assert pack["cart_total_eur"] > 0 and isinstance(pack["within_budget"], bool)


def test_api_without_country_is_byte_identical():
    body, _ = demo(FRITTATA)
    a = client.post("/api/evaluate", json=body)
    b = client.post("/api/evaluate", json=body)
    assert a.content == b.content and "prices_estimated" not in a.json()["evaluation"]["pack"]


@pytest.mark.parametrize("country", ["FR", "es", "", None, 1])
def test_api_rejects_other_countries(country):
    body, _ = demo(TUNA)
    r = client.post("/api/evaluate", json={**body, "country": country})
    assert r.status_code == 422
