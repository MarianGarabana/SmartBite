"""User prices (decision P16): the evaluate request may carry prices per food and pack size, typed by the user and
kept in their browser. The budget check runs only when every bought line has one; without prices the reply is the
same as before prices existed."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.contracts import validate_output
from smartbite_engine.meal import evaluate

DEMO = Path(__file__).resolve().parents[1] / "web" / "demo" / "meals"
client = TestClient(app)


def demo(slug):
    meal = json.loads((DEMO / f"{slug}.json").read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}, meal


TUNA = "tuna-and-chickpea-salad-with-skyr-dressing"  # 2 servings, budget 10 EUR
FRITTATA = "tuna-frittata-with-vegetables"  # eggs: one pack of 24


def pack_size(line):
    return line["grams_bought"] / line["packs_to_buy"]


def bought_lines(meal):
    return [l for l in meal["evaluation"]["pack"]["lines"] if not l["optional"]]


def price_all(meal, price=1.0):
    return [{"food": l["food"], "pack_grams": pack_size(l), "price_eur": price} for l in bought_lines(meal)]


def post(body):
    r = client.post("/api/evaluate", json=body)
    return r, r.json()


def lines_by_food(data):
    return {l["food"]: l for l in data["evaluation"]["pack"]["lines"]}


@pytest.mark.parametrize("prices", [None, []], ids=["no prices field", "empty list"])
def test_no_prices_gives_the_same_reply_as_before(prices):
    body, meal = demo(TUNA)
    plain = client.post("/api/evaluate", json=body)
    r = client.post("/api/evaluate", json=body if prices is None else {**body, "prices": prices})
    assert r.status_code == 200 and r.content == plain.content
    assert r.json()["evaluation"] == meal["evaluation"]


def test_every_bought_line_priced_runs_the_budget_check():
    body, meal = demo(TUNA)
    r, data = post({**body, "prices": price_all(meal, 1.0)})
    assert r.status_code == 200 and validate_output(data, "evaluate.schema.json", "Output") == []
    pack = data["evaluation"]["pack"]
    packs = sum(l["packs_to_buy"] for l in bought_lines(meal))
    assert pack["budget_check_complete"] is True and pack["unpriced"] == []
    assert pack["cart_total_eur"] == pytest.approx(packs * 1.0)
    assert pack["cost_per_serving_eur"] == pytest.approx(packs / body["form"]["servings"])
    assert pack["within_budget"] is (packs <= body["form"]["budget_total_eur"])
    for line in bought_lines(data):
        assert line["has_price"] is True and line["price_source"] == "user"
    # Packs and grams bought do not change when the price is for the pack the page showed
    before = {l["food"]: (l["packs_to_buy"], l["grams_bought"]) for l in bought_lines(meal)}
    assert {l["food"]: (l["packs_to_buy"], l["grams_bought"]) for l in bought_lines(data)} == before


def test_over_budget_when_prices_are_high():
    body, meal = demo(TUNA)
    _, data = post({**body, "prices": price_all(meal, 5.0)})
    pack = data["evaluation"]["pack"]
    assert pack["budget_check_complete"] is True and pack["within_budget"] is False
    assert pack["over_budget_eur"] == pytest.approx(pack["cart_total_eur"] - body["form"]["budget_total_eur"])
    assert any(r["reason"] == "over_budget" for r in pack["change_requests"])


def test_partial_prices_leave_the_budget_check_incomplete():
    body, meal = demo(TUNA)
    _, data = post({**body, "prices": price_all(meal, 0.5)[:2]})
    pack = data["evaluation"]["pack"]
    assert pack["budget_check_complete"] is False
    assert len(pack["unpriced"]) == len(bought_lines(meal)) - 2
    # Unpriced lines keep their typical packs and leftovers
    for line in bought_lines(data):
        if not line["has_price"]:
            assert line["grams_bought"] > 0 and line["price_source"] == "typical"


def test_eggs_are_priced_by_the_pack_weight_of_the_size_shown():
    body, meal = demo(FRITTATA)
    eggs = lines_by_food(meal)["eggs"]
    assert pack_size(eggs) == 24 * 51 and eggs["product_name"] == "eggs clase M 24 uds"
    _, data = post({**body, "prices": [{"food": "eggs", "pack_grams": 1224, "price_eur": 5.40}]})
    line = lines_by_food(data)["eggs"]
    assert line["has_price"] is True and line["product_name"] == "eggs clase M 24 uds"
    assert line["packs_to_buy"] == 1 and line["cost_bought_eur"] == pytest.approx(5.40)


def test_loose_item_price_is_for_the_unit_shown():
    body, meal = demo(TUNA)
    lemon = lines_by_food(meal)["lemon"]
    # Loose produce is bought by the piece: one lemon (USDA, 58 g), priced per lemon
    assert lemon["sold_by"] == "per_kg" and pack_size(lemon) == 58
    _, data = post({**body, "prices": [{"food": "lemon", "pack_grams": 58, "price_eur": 0.30}]})
    line = lines_by_food(data)["lemon"]
    assert line["has_price"] is True and line["cost_bought_eur"] == pytest.approx(0.30)
    assert line["cost_used_eur"] == pytest.approx(line["grams_needed"] / 58 * 0.30)


def test_a_size_that_is_not_a_typical_pack_is_ignored():
    body, meal = demo(TUNA)
    _, data = post({**body, "prices": [{"food": "lemon", "pack_grams": 777, "price_eur": 2.20},
                                       {"food": "not a food", "pack_grams": 100, "price_eur": 1.0}]})
    assert data["evaluation"] == meal["evaluation"]


def test_price_for_a_non_default_size_prices_that_size():
    body, meal = demo(TUNA)
    tuna = lines_by_food(meal)["canned tuna in water"]  # 2 x 168 g (the default size)
    _, data = post({**body, "prices": [{"food": "canned tuna in water", "pack_grams": 480, "price_eur": 4.0}]})
    line = lines_by_food(data)["canned tuna in water"]
    assert line["has_price"] is True and line["packs_to_buy"] == 1 and line["grams_bought"] == 480
    assert line["grams_needed"] == tuna["grams_needed"]


def test_cheapest_priced_size_wins_and_unpriced_sizes_are_not_bought():
    body, _ = demo(TUNA)
    prices = [{"food": "canned tuna in water", "pack_grams": 168, "price_eur": 1.5},
              {"food": "canned tuna in water", "pack_grams": 336, "price_eur": 2.0}]
    _, data = post({**body, "prices": prices})
    line = lines_by_food(data)["canned tuna in water"]
    assert line["grams_bought"] == 336 and line["cost_bought_eur"] == pytest.approx(2.0)


def test_optional_line_price_stays_out_of_the_cart_total():
    body, meal = demo(TUNA)
    _, data = post({**body, "prices": [{"food": "mustard", "pack_grams": 300, "price_eur": 1.10}]})
    pack = data["evaluation"]["pack"]
    assert pack["cart_total_eur"] == 0 and pack["optional_total_eur"] == pytest.approx(1.10)
    assert lines_by_food(data)["mustard"]["has_price"] is True


def test_engine_takes_the_list_form_directly():
    body, meal = demo(TUNA)
    direct = evaluate(body["form"], body["picked_idea"], body["recipe"], prices=price_all(meal, 1.0))
    _, data = post({**body, "prices": price_all(meal, 1.0)})
    assert direct["evaluation"] == data["evaluation"]


@pytest.mark.parametrize("prices, message", [
    ([{"food": "lemon", "pack_grams": 1000, "price_eur": -1}], "must be >= 0"),
    ([{"food": "lemon", "pack_grams": 0, "price_eur": 1}], "must be > 0"),
    ([{"food": "lemon", "pack_grams": 1000, "price_eur": "2.20"}], "must be number"),
    ([{"food": "lemon", "pack_grams": 1000}], "missing required field price_eur"),
    ([{"food": "lemon", "pack_grams": 1000, "price_eur": 1, "shop": "x"}], "unexpected field shop"),
    ({"lemon": {"1000": 2.2}}, "must be array"),
    ([{"food": "lemon", "pack_grams": 1000, "price_eur": 1}] * 2, "second price for lemon 1000 g"),
    ([{"food": f"food {i}", "pack_grams": 100, "price_eur": 1} for i in range(201)], "at most 200 items"),
])
def test_bad_prices_are_a_422(prices, message):
    body, _ = demo(TUNA)
    r, data = post({**body, "prices": prices})
    assert r.status_code == 422
    assert any(message in e for e in data["errors"]), data["errors"]
