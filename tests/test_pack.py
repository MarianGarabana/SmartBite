import pytest

from smartbite_engine.pack import PRICE_NOTE, pack_line, pack_meal

CHICKEN = {"name": "Chicken breast fillets 500 g", "link": "https://x/chicken-500", "sold_by": "pack",
           "pack_grams": 500, "price_eur": 3.50, "price_per_kg_eur": 7.00, "other_options": [
               {"name": "Chicken breast family pack 1700 g", "link": "https://x/chicken-1700", "pack_grams": 1700, "price_eur": 10.00, "price_per_kg_eur": 5.88},
               {"name": "Chicken breast fillets 1100 g", "link": "https://x/chicken-1100", "pack_grams": 1100, "price_eur": 8.00, "price_per_kg_eur": 7.27},
               {"name": "Chicken thighs 1 kg", "link": "https://x/thighs", "pack_grams": 1000, "price_eur": 1.00, "price_per_kg_eur": 1.00}]}
POTATO = {"name": "Loose potatoes per kg.", "link": "https://x/potato", "sold_by": "per_kg",
          "pack_grams": 1000, "price_eur": 1.40, "price_per_kg_eur": 1.40, "other_options": []}
EGGS = {"name": "Eggs clase M 10 uds", "link": "https://x/eggs-m-10", "sold_by": "per_unit",
        "pack_grams": None, "units_per_pack": 10, "price_eur": 1.00, "price_per_kg_eur": None, "other_options": []}


def test_pack_rounds_up_to_whole_packs():
    line = pack_line("chicken breast", 800, {**CHICKEN, "other_options": []}, storage="fresh")
    assert line["packs_to_buy"] == 2
    assert line["grams_bought"] == 1000
    assert line["grams_left"] == 200
    assert line["cost_bought_eur"] == pytest.approx(7.00)
    assert line["cost_used_eur"] == pytest.approx(3.50 * 800 / 500)
    assert line["leftover_pct"] == pytest.approx(20.0)
    assert line["leftover_status"] == "use_in_2_days"


def test_pack_picks_cheapest_option_that_covers_need_with_same_main_word():
    # 1600 g: 4x500 g = 14.00, family pack 1700 g = 10.00, 2x1100 g = 16.00; "thighs" is a different product
    line = pack_line("chicken breast", 1600, CHICKEN, storage="fresh", main_word="breast")
    assert line["product_name"] == "Chicken breast family pack 1700 g"
    assert line["cost_bought_eur"] == pytest.approx(10.00)


def test_loose_item_bought_in_whole_kg_at_price_per_kg():
    line = pack_line("potato", 1200, POTATO, storage="keeps")
    assert line["sold_by"] == "per_kg"
    assert line["packs_to_buy"] == 2
    assert line["grams_bought"] == 2000
    assert line["grams_left"] == 800  # 2 x 1000 g minus grams needed
    assert line["cost_bought_eur"] == pytest.approx(2.80)
    assert line["leftover_status"] == "keeps"


def test_loose_item_bought_in_the_unit_the_store_sells():
    # Loose items are bought in the store's unit (avocado 600 g), not always in whole kg
    avocado = {"name": "Loose avocados.", "link": "https://x/avocado", "sold_by": "per_kg", "pack_grams": 600,
               "price_eur": 3.00, "price_per_kg_eur": 5.00, "other_options": []}
    line = pack_line("avocado", 200, avocado, storage="fresh")
    assert (line["packs_to_buy"], line["grams_bought"], line["grams_left"]) == (1, 600, 400)
    assert line["cost_bought_eur"] == pytest.approx(0.6 * 5.00)


def test_eggs_counted_in_units_and_size_m_grams():
    line = pack_line("eggs", 306, EGGS, units_needed=6, storage="fresh")
    assert line["units_needed"] == 6
    assert line["packs_to_buy"] == 1
    assert line["units_bought"] == 10
    assert line["grams_bought"] == 510  # 10 eggs x 51 g
    assert line["cost_used_eur"] == pytest.approx(0.60)


# Egg fix 2026-10-04: other egg packs are compared by their own unit count, same size class only
EGG_PACKS = {**EGGS, "other_options": [
    {"name": "Eggs clase M 12 uds", "link": "https://x/eggs-m-12", "pack_grams": None, "price_eur": 3.00, "price_per_kg_eur": None},
    {"name": "Eggs clase M 30 uds", "link": "https://x/eggs-m-30", "pack_grams": None, "price_eur": 7.00, "price_per_kg_eur": None},
    {"name": "Eggs clase L 12 uds", "link": "https://x/eggs-l-12", "pack_grams": None, "price_eur": 3.20, "price_per_kg_eur": None},
    {"name": "Eggs clase S 6 uds", "link": "https://x/eggs-s-6", "pack_grams": None, "price_eur": 1.00, "price_per_kg_eur": None}]}


def test_eggs_compare_other_packs_by_their_own_unit_count():
    # 10-pack at a real price: with price + leftover value (2026-10-06) a 1.00 EUR 10-pack would win on cost alone
    line = pack_line("eggs", 612, {**EGG_PACKS, "price_eur": 2.50}, units_needed=12, storage="fresh",
                     prefer_less_leftover=True)
    assert line["product_name"] == "Eggs clase M 12 uds"
    assert (line["packs_to_buy"], line["units_bought"], line["grams_left"]) == (1, 12, 0)
    assert line["cost_bought_eur"] == pytest.approx(3.00)


def test_eggs_that_keep_take_the_cheapest_pack():
    line = pack_line("eggs", 612, EGG_PACKS, units_needed=12, storage="keeps", prefer_less_leftover=True)
    assert (line["product_name"], line["packs_to_buy"], line["units_bought"]) == ("Eggs clase M 10 uds", 2, 20)
    assert line["cost_bought_eur"] == pytest.approx(2.00)


def test_eggs_never_switch_size_class():
    # 3 eggs: the S 6-pack would leave less, but S eggs weigh 42 g, not 51 g
    line = pack_line("eggs", 153, EGG_PACKS, units_needed=3, storage="fresh", prefer_less_leftover=True)
    assert line["product_name"] == "Eggs clase M 10 uds"


def test_missing_price_is_flagged_not_guessed():
    line = pack_line("arugula", 50, None)
    assert line["has_price"] is False
    assert line["cost_bought_eur"] is None


def test_meal_totals_waste_and_note():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"),
             pack_line("chicken breast", 800, {**CHICKEN, "other_options": []}, storage="fresh")]
    result = pack_meal(lines, servings=4, budget_total_eur=20, keep_leftovers_low=True)
    assert result["cart_total_eur"] == pytest.approx(2.80 + 7.00)
    assert result["cost_per_serving_eur"] == pytest.approx((2.80 + 7.00) / 4)
    assert result["waste_grams"] == 1000
    assert result["within_budget"] is True
    assert result["price_note"] == PRICE_NOTE
    assert result["change_requests"] == []


def test_over_budget_asks_recipe_for_cheaper_swap_on_most_expensive_line():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"),
             pack_line("chicken breast", 800, {**CHICKEN, "other_options": []}, storage="fresh")]
    result = pack_meal(lines, servings=4, budget_total_eur=8, keep_leftovers_low=False)
    assert result["within_budget"] is False
    assert result["over_budget_eur"] == pytest.approx(2.80 + 7.00 - 8)
    assert result["change_requests"][0]["reason"] == "over_budget"
    assert result["change_requests"][0]["ingredient"] == "chicken breast"


def test_high_leftover_on_fresh_item_asks_to_use_pack_better():
    lines = [pack_line("chicken breast", 600, {**CHICKEN, "other_options": []}, storage="fresh")]  # 400/1000 left
    result = pack_meal(lines, servings=2, budget_total_eur=50, keep_leftovers_low=True)
    assert [r["reason"] for r in result["change_requests"]] == ["high_leftover"]


def test_no_leftover_request_when_waste_preference_off():
    lines = [pack_line("chicken breast", 600, {**CHICKEN, "other_options": []}, storage="fresh")]
    result = pack_meal(lines, servings=2, budget_total_eur=50, keep_leftovers_low=False)
    assert result["change_requests"] == []


def test_unpriced_line_makes_budget_check_incomplete():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"), pack_line("arugula", 50, None)]
    result = pack_meal(lines, servings=1, budget_total_eur=20, keep_leftovers_low=True)
    assert result["budget_check_complete"] is False
    assert result["unpriced"] == ["arugula"]


# Bug 9: leftover fixes must not inflate portions
CHEAP_BIG = {"name": "Spinach 1 kg", "link": "https://x/a", "sold_by": "pack", "pack_grams": 1000, "price_eur": 2.50,
             "price_per_kg_eur": 2.50, "other_options": [
                 {"name": "Spinach bag 500 g", "link": "https://x/b", "pack_grams": 500, "price_eur": 3.00, "price_per_kg_eur": 6.00}]}


def test_fresh_item_with_low_leftover_wish_prefers_smaller_pack_over_cheapest():
    line = pack_line("spinach", 450, CHEAP_BIG, storage="fresh", main_word="spinach", prefer_less_leftover=True)
    assert line["product_name"] == "Spinach bag 500 g" and line["grams_left"] == 50


def test_without_low_leftover_wish_cheapest_pack_wins():
    line = pack_line("spinach", 450, CHEAP_BIG, storage="fresh", main_word="spinach")
    assert line["product_name"] == "Spinach 1 kg"


def test_high_leftover_hint_forbids_inflating_portions():
    lines = [pack_line("chicken breast", 600, {**CHICKEN, "other_options": []}, storage="fresh")]
    hint = pack_meal(lines, servings=2, budget_total_eur=50, keep_leftovers_low=True)["change_requests"][0]["hint"]
    assert "15%" in hint and "another meal" in hint and "Adjust grams to use the pack" not in hint


def test_leftover_marked_for_another_meal_is_accepted_without_rerun():
    line = pack_line("chicken breast", 600, {**CHICKEN, "other_options": []}, storage="fresh",
                     leftover_plan="use_in_another_meal")
    result = pack_meal([line], servings=2, budget_total_eur=50, keep_leftovers_low=True)
    assert result["change_requests"] == [] and line["leftover_status"] == "use_in_another_meal"


def test_product_name_loses_its_trailing_period():
    line = pack_line("potato", 500, POTATO)
    assert line["product_name"] == "Loose potatoes per kg"


# Optional lines: spices, oil, sauces and bottled juice last for weeks, so the user decides in the
# cart. They are listed but left out of the meal's cost, budget, waste and leftover checks.
MUSTARD = {"name": "Mustard jar 200 g", "link": "https://x/mustard", "sold_by": "pack", "pack_grams": 200,
           "price_eur": 1.20, "price_per_kg_eur": 6.00, "other_options": []}


def test_optional_line_is_flagged_and_left_out_of_cost_and_waste():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"),
             pack_line("mustard", 10, MUSTARD, storage="keeps", optional=True)]
    assert (lines[0]["optional"], lines[1]["optional"]) == (False, True)
    result = pack_meal(lines, servings=4, budget_total_eur=20, keep_leftovers_low=True)
    assert result["cart_total_eur"] == pytest.approx(2.80)
    assert result["optional_total_eur"] == pytest.approx(1.20)
    assert result["waste_grams"] == 800


def test_optional_line_never_breaks_the_budget_or_asks_for_less_leftover():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"),
             pack_line("mustard", 10, {**MUSTARD, "price_eur": 9.0}, storage="fresh", optional=True)]
    result = pack_meal(lines, servings=1, budget_total_eur=3, keep_leftovers_low=True)
    assert result["within_budget"] is True and result["change_requests"] == []


def test_unpriced_optional_line_keeps_the_budget_check_complete():
    lines = [pack_line("potato", 1200, POTATO, storage="keeps"), pack_line("cumin", 2, None, optional=True)]
    result = pack_meal(lines, servings=1, budget_total_eur=20, keep_leftovers_low=False)
    assert result["budget_check_complete"] is True and result["unpriced"] == []


# The user's own product: "always": true means that exact product, never one of its other options
def test_always_product_is_bought_even_when_another_pack_leaves_less():
    feta = {"name": "White salad cheese 200 g", "link": "https://x/salad-cheese", "sold_by": "pack",
            "pack_grams": 200, "price_eur": 2.50, "price_per_kg_eur": 12.50, "always": True, "other_options": [
                {"name": "Feta cheese 150 g", "link": "https://x/feta150", "pack_grams": 150, "price_eur": 3.50,
                 "price_per_kg_eur": 23.33}]}
    line = pack_line("feta", 50, feta, storage="fresh", main_word="feta", prefer_less_leftover=True)
    assert line["product_url"] == "https://x/salad-cheese" and line["grams_bought"] == 200


# Leftover-first would buy 6 x 20 g parsley (9.60 EUR, 1 g left) over one 125 g bunch (1.70 EUR, 6 g left).
# Fresh food with the low-leftover wish takes the lowest price paid plus value of the leftover.
def test_low_leftover_wish_never_buys_many_small_packs_to_save_a_few_grams():
    parsley = {"name": "Parsley bunch 125 g", "link": "https://x/bunch", "sold_by": "pack",
               "pack_grams": 125, "price_eur": 1.70, "price_per_kg_eur": 13.60, "other_options": [
                   {"name": "Flat parsley tray 20 g", "link": "https://x/20g", "pack_grams": 20, "price_eur": 1.60,
                    "price_per_kg_eur": 80.0}]}
    line = pack_line("fresh parsley", 119, parsley, storage="fresh", main_word="parsley", prefer_less_leftover=True)
    assert line["product_url"] == "https://x/bunch" and line["packs_to_buy"] == 1
