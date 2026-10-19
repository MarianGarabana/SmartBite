import pytest

from smartbite_engine.generic_packs import buy_unpriced, load_packs, pack_entry, product_option
from smartbite_engine.pack import pack_line

CHICKPEAS = {"sold_by": "pack", "typical_packs": [{"grams": 400, "share": 0.6}, {"grams": 250, "share": 0.3}],
             "default_grams": 400, "n_products": 20, "note": "Drained weight where the label gives it."}
POTATO = {"sold_by": "per_kg", "typical_packs": [{"grams": 1000, "share": 1.0}], "default_grams": 1000,
          "n_products": 0, "note": "Loose, bought in 1 kg units."}
EGGS = {"sold_by": "per_unit", "typical_packs": [{"grams": 612, "units": 12, "share": 0.5},
                                                 {"grams": 306, "units": 6, "share": 0.4}],
        "default_grams": 612, "units_per_pack": 12, "n_products": 30, "note": "Size M."}


def test_option_without_price_has_the_product_option_shape():
    option = product_option("canned chickpeas", CHICKPEAS)
    assert set(option) == {"name", "link", "sold_by", "pack_grams", "price_eur", "price_per_kg_eur",
                           "units_per_pack", "other_options", "always", "price_date", "price_source"}
    assert option["pack_grams"] == 400 and option["link"] is None
    assert option["price_eur"] is None and option["price_source"] is None and option["price_date"] is None
    assert [o["pack_grams"] for o in option["other_options"]] == [250]
    # pack.py only compares other packs whose name holds the food's main word
    assert "chickpeas" in option["other_options"][0]["name"]


def test_unpriced_option_is_flagged_by_pack_line_and_grams_come_from_buy_unpriced():
    option = product_option("canned chickpeas", CHICKPEAS)
    line = pack_line("canned chickpeas", 500, option, storage="keeps")
    assert line["has_price"] is False and line["cost_bought_eur"] is None
    assert buy_unpriced(500, option) == {"packs_to_buy": 2, "grams_bought": 800, "grams_left": 300}


def test_user_price_makes_a_priced_line_with_source_user():
    option = product_option("canned chickpeas", CHICKPEAS, price_eur=0.80, price_date="2026-10-19")
    assert option["price_source"] == "user" and option["price_per_kg_eur"] == pytest.approx(2.0)
    line = pack_line("canned chickpeas", 500, option, storage="keeps", main_word="chickpeas")
    assert line["has_price"] is True and line["price_source"] == "user"
    assert (line["packs_to_buy"], line["grams_bought"], line["grams_left"]) == (2, 800, 300)
    assert line["cost_bought_eur"] == pytest.approx(1.60)
    assert line["product_url"] is None


def test_priced_other_size_can_win_in_pack_line():
    option = product_option("canned chickpeas", CHICKPEAS, price_eur=0.80, other_prices={250: 0.40})
    line = pack_line("canned chickpeas", 600, option, storage="keeps", main_word="chickpeas")
    # 2 x 400 g = 1.60 EUR vs 3 x 250 g = 1.20 EUR
    assert line["product_name"] == "canned chickpeas 250 g" and line["cost_bought_eur"] == pytest.approx(1.20)


def test_loose_item_bought_in_whole_units():
    option = product_option("potato", POTATO)
    assert option["sold_by"] == "per_kg" and option["pack_grams"] == 1000
    assert buy_unpriced(1200, option) == {"packs_to_buy": 2, "grams_bought": 2000, "grams_left": 800}
    priced = pack_line("potato", 1200, product_option("potato", POTATO, price_eur=1.50), storage="keeps")
    assert priced["cost_bought_eur"] == pytest.approx(3.00)


def test_eggs_in_units_with_size_m_grams():
    option = product_option("eggs", EGGS)
    assert option["units_per_pack"] == 12 and option["pack_grams"] is None
    assert [o["units_per_pack"] for o in option["other_options"]] == [6]
    assert buy_unpriced(0, option, units_needed=7) == {"packs_to_buy": 1, "units_needed": 7, "units_bought": 12,
                                                       "grams_bought": 612, "grams_left": 255}
    # Priced: pack.py reads the size class and unit count from the names
    option = product_option("eggs", EGGS, price_eur=3.00, other_prices={6: 1.20})
    line = pack_line("eggs", 306, option, units_needed=6, storage="keeps")
    assert (line["product_name"], line["units_bought"]) == ("eggs clase M 6 uds", 6)


def test_option_with_only_an_other_price_is_still_unpriced_for_pack_line():
    option = product_option("canned chickpeas", CHICKPEAS, other_prices={250: 0.40})
    assert option["price_eur"] is None and option["price_source"] is None
    assert pack_line("canned chickpeas", 100, option)["has_price"] is False


def test_pack_entry_finds_a_food_by_any_name():
    packs = {"canned chickpeas": CHICKPEAS, "eggs": EGGS}
    assert pack_entry("canned chickpeas", packs) == ("canned chickpeas", CHICKPEAS)
    assert pack_entry("Garbanzos cocidos", packs) == ("canned chickpeas", CHICKPEAS)
    assert pack_entry("huevo", packs)[0] == "eggs"
    assert pack_entry("dragon fruit", packs) is None
    assert pack_entry("pechuga de pollo")[0] == "chicken breast"


def test_packs_json_entries_all_make_valid_options():
    foods = load_packs()
    assert len(foods) > 50
    for food, entry in foods.items():
        option = product_option(food, entry)
        result = buy_unpriced(150, option, units_needed=2 if entry["sold_by"] == "per_unit" else None)
        assert result["grams_bought"] >= (102 if entry["sold_by"] == "per_unit" else 150), food
        assert result["grams_left"] >= 0, food
