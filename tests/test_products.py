"""User products (region and supermarket, decided 2026-10-21): the evaluate request may carry one saved product per
food (pack size, price, label), picked by the browser for the user's store. Rules the schema cannot express are a
422 from the API."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.estimated_prices import load_estimates, pack_estimate
from smartbite_engine.meal import evaluate, product_errors

DEMO = Path(__file__).resolve().parents[1] / "web" / "demo" / "meals"
TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"  # 2 servings: 400 g chickpeas, 300 g skyr, 120 g lettuce
FRITTATA = "tuna-frittata-with-vegetables"  # 4 servings: 20 eggs
client = TestClient(app)


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}


def product(**extra):
    return {"food": "canned chickpeas", "name": "Garbanzos cocidos 570 g", "sold_by": "pack", "pack_grams": 570,
            **extra}


def test_good_products_pass_the_code_rules():
    eggs = {"food": "eggs", "name": "Huevos L 12 uds", "sold_by": "per_unit", "units_per_pack": 12}
    loose = {"food": "lemon", "name": "Limon", "sold_by": "per_kg", "pack_grams": 1000}
    assert product_errors([product(barcode="12345670", price_date="2026-10-21"), eggs, loose]) == []
    assert product_errors(None) == [] and product_errors([]) == []


def test_a_request_with_products_is_accepted():
    r = client.post("/api/evaluate", json={**demo(TUNA), "products": [product(price_eur=0.89)]})
    assert r.status_code == 200, r.json()


@pytest.mark.parametrize("products, message", [
    ([product(), product(food=" Canned Chickpeas ")], "second product for  Canned Chickpeas "),
    ([product(sold_by="per_unit")], "sold per unit needs units_per_pack and no pack_grams"),
    ([{**product(sold_by="per_unit", units_per_pack=6)}], "sold per unit needs units_per_pack and no pack_grams"),
    ([{k: v for k, v in product().items() if k != "pack_grams"}], "sold pack needs pack_grams and no units_per_pack"),
    ([product(sold_by="per_kg", units_per_pack=1)], "sold per_kg needs pack_grams and no units_per_pack"),
    ([product(barcode="12-3456")], "barcode must be 8 to 14 digits"),
    ([product(barcode="1234567")], "barcode must be 8 to 14 digits"),
    ([product(price_date="21/10/2026")], "price_date must be YYYY-MM-DD"),
    ([product(name="x" * 121)], "name: "),
    ([product(food=f"food {i}") for i in range(201)], "at most 200 items"),
])
def test_bad_products_are_a_422(products, message):
    r = client.post("/api/evaluate", json={**demo(TUNA), "products": products})
    assert r.status_code == 422
    assert any(message in e for e in r.json()["errors"]), r.json()["errors"]


def post(slug, **extra):
    r = client.post("/api/evaluate", json={**demo(slug), **extra})
    assert r.status_code == 200, r.json()
    return r.json()


def line(data, food):
    return next(l for l in data["evaluation"]["pack"]["lines"] if l["food"] == food)


def macro(data, food):
    return next(m for m in data["evaluation"]["macros"]["lines"] if m["food"] == food)


def test_product_pack_size_and_price_replace_the_typical_packs():
    got = line(post(TUNA, products=[product(price_eur=1.10, price_date="2026-10-21")]), "canned chickpeas")
    assert got["user_product"] is True and got["has_price"] is True
    assert (got["product_name"], got["packs_to_buy"], got["grams_bought"]) == ("Garbanzos cocidos 570 g", 1, 570)
    assert got["grams_left"] == 170 and got["cost_bought_eur"] == pytest.approx(1.10)
    assert (got["price_source"], got["price_date"]) == ("user", "2026-10-21")


def test_product_price_wins_over_engine_prices_and_estimates():
    typed = [{"food": "canned chickpeas", "pack_grams": 400, "price_eur": 9.99}]
    out = evaluate(**demo(TUNA), prices=typed, country="ES", products=[product(price_eur=1.10)])
    got = line(out, "canned chickpeas")
    assert got["price_source"] == "user" and got["cost_bought_eur"] == pytest.approx(1.10)


def test_product_without_price_gets_the_estimate_for_its_own_pack_size():
    got = line(post(TUNA, country="ES", products=[product()]), "canned chickpeas")
    record = load_estimates("ES")["foods"]["canned chickpeas"]
    assert got["grams_bought"] == 570 and got["price_source"] == "estimate" and "price_period" in got
    assert got["cost_bought_eur"] == pytest.approx(pack_estimate(record, grams=570))


def test_product_without_price_and_no_country_is_unpriced_with_its_pack_size():
    data = post(TUNA, products=[product()])
    got = line(data, "canned chickpeas")
    assert got["has_price"] is False and got["price_source"] is None and got["user_product"] is True
    assert (got["packs_to_buy"], got["grams_bought"], got["grams_left"]) == (1, 570, 170)
    assert "canned chickpeas" in data["evaluation"]["pack"]["unpriced"]


def test_label_replaces_the_nutrition_table_for_that_food_only():
    label = {"kcal": 60, "protein_g": 11, "carbs_g": 3.5, "fat_g": 0.2}
    skyr = {"food": "skyr", "name": "Skyr natural 500 g", "sold_by": "pack", "pack_grams": 500,
            "barcode": "12345670", "per_100g": label}
    plain, data = post(TUNA), post(TUNA, products=[skyr, product()])
    got = macro(data, "skyr")
    assert (got["source"], got["source_id"]) == ("label", "12345670")
    assert got["amount"] == {"kcal": 180, "protein_g": 33, "carbs_g": 10.5, "fat_g": 0.6}  # 300 g
    assert macro(data, "canned chickpeas") == macro(plain, "canned chickpeas")  # product with no label: table


def test_label_from_open_food_facts_is_named_as_the_macro_source():
    label = {"kcal": 60, "protein_g": 11, "carbs_g": 3.5, "fat_g": 0.2}
    skyr = {"food": "skyr", "name": "Skyr natural 500 g", "sold_by": "pack", "pack_grams": 500,
            "barcode": "12345670", "per_100g": label, "label_source": "open_food_facts"}
    got = macro(post(TUNA, products=[skyr]), "skyr")
    assert (got["source"], got["source_id"]) == ("open_food_facts", "12345670")
    assert got["amount"]["protein_g"] == 33
    typed = macro(post(TUNA, products=[{**skyr, "label_source": "user"}]), "skyr")
    assert typed["source"] == "label"
    r = client.post("/api/evaluate", json={**demo(TUNA), "products": [{**skyr, "label_source": "store"}]})
    assert r.status_code == 422


def test_egg_product_counts_units_per_box():
    eggs = {"food": "eggs", "name": "Huevos camperos M 6 uds", "sold_by": "per_unit", "units_per_pack": 6,
            "price_eur": 2.0}
    got = line(post(FRITTATA, products=[eggs]), "eggs")
    assert (got["units_needed"], got["packs_to_buy"], got["units_bought"]) == (20, 4, 24)
    assert got["cost_bought_eur"] == pytest.approx(8.0) and got["product_name"] == "Huevos camperos M 6 uds"


def test_loose_product_buys_the_unit_the_store_sells():
    lettuce = {"food": "lettuce", "name": "Lechuga romana", "sold_by": "per_kg", "pack_grams": 400, "price_eur": 0.8}
    got = line(post(TUNA, products=[lettuce]), "lettuce")
    assert (got["packs_to_buy"], got["grams_bought"], got["grams_left"]) == (1, 400, 280)
    assert got["cost_bought_eur"] == pytest.approx(0.8) and got["leftover_status"] == "use_in_2_days"


def test_products_for_other_foods_change_nothing():
    plain = post(TUNA, country="ES")
    other = {"food": "salmon", "name": "Salmon 250 g", "sold_by": "pack", "pack_grams": 250, "price_eur": 5}
    assert post(TUNA, country="ES", products=[other]) == plain


def test_food_key_is_matched_without_case_or_spaces():
    got = line(post(TUNA, products=[product(food=" Canned Chickpeas ", price_eur=1.1)]), "canned chickpeas")
    assert got["user_product"] is True
