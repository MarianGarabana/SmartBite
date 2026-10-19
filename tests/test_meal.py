import pytest

from smartbite_engine.contracts import validate_output
from smartbite_engine.meal import OPTIONAL_FOODS, evaluate, mfp_block, mfp_mark


def rec(kcal, protein, carbs, fat, state="raw"):
    return {"kcal": kcal, "protein_g": protein, "carbs_g": carbs, "fat_g": fat, "source": "ciqual",
            "source_id": "x", "source_name": "test", "state": state}


TABLE = {"chicken breast": rec(110, 23, 0, 1.5), "rice": rec(350, 7, 78, 1), "cucumber": rec(15, 0.7, 3.6, 0.1),
         "eggs": rec(140, 12.8, 0.6, 9.8), "salt": rec(0, 0, 0, 0), "lemon juice": rec(22, 0.4, 6.9, 0.2)}


def pack(*grams):
    return {"sold_by": "pack", "typical_packs": [{"grams": g, "share": None} for g in grams],
            "default_grams": grams[0], "n_products": 1, "note": "test"}


PACKS = {"chicken breast": pack(500, 400), "rice": pack(1000), "salt": pack(1000), "lemon juice": pack(250),
         "greek yogurt 0%": pack(500),
         "cucumber": {"sold_by": "per_kg", "typical_packs": [{"grams": 1000, "share": 1.0}], "default_grams": 1000,
                      "n_products": 0, "note": "loose"},
         "eggs": {"sold_by": "per_unit", "typical_packs": [{"grams": 612, "units": 12, "share": 0.5},
                                                           {"grams": 306, "units": 6, "share": 0.4}],
                  "default_grams": 612, "units_per_pack": 12, "n_products": 1, "note": "size M"}}

FORM = {"craving": "chicken rice bowl", "servings": 2, "budget_total_eur": 10, "kcal_target": 450,
        "protein_g_target": 45, "keep_leftovers_low": True, "carbs_g_max": 50}
IDEA = {"idea_id": "1", "name": "Chicken rice bowl", "one_line": "Chicken, rice, cucumber and egg.",
        "main_ingredients": ["chicken breast", "rice"], "rough_macros": {"kcal": 450, "protein_g": 45, "carbs_g": 40,
                                                                        "fat_g": 10},
        "image_prompt": "bowl"}


def ing(name, grams, storage="keeps", pantry=False, dry=False, units=0, **extra):
    return {"name": name, "grams_per_serving": grams, "units_per_serving": units, "storage": storage,
            "pantry": pantry, "dry": dry, **extra}


RECIPE = {"idea_id": "1", "title": "Chicken rice bowl", "servings": 2, "prep_time_min": 30, "steps": ["Cook."],
          "ingredients": [ing("Chicken Breast", 150, "fresh"), ing("arroz", 80, dry=True), ing("cucumber", 80, "fresh"),
                          ing("eggs", 51, "fresh", units=1), ing("salt", 1, pantry=True), ing("lemon juice", 10),
                          ing("dragon fruit powder", 5)]}


def run(form=FORM, recipe=RECIPE, **kw):
    return evaluate(form, IDEA, recipe, table=TABLE, packs=PACKS, **kw)


def lines(meal):
    return {l["ingredient"]: l for l in meal["evaluation"]["pack"]["lines"]}


def test_result_is_a_valid_meal_and_keeps_the_input():
    meal = run()
    assert validate_output(meal, "meal.schema.json") == []
    assert meal["form"] == FORM and meal["recipe"] == RECIPE and meal["picked_idea"] == IDEA


def test_names_resolve_to_english_keys_and_unknown_names_are_listed_not_guessed():
    meal = run()
    items = {i["name"]: i["food"] for i in meal["evaluation"]["items"]}
    assert items["Chicken Breast"] == "chicken breast" and items["arroz"] == "rice"
    assert items["dragon fruit powder"] is None
    macros = meal["evaluation"]["macros"]
    assert macros["unresolved"] == ["dragon fruit powder"]
    assert "dragon fruit powder: unknown food, left out of the totals" in macros["missing_nutrition"]
    unknown = lines(meal)["dragon fruit powder"]
    assert unknown["has_price"] is False and unknown["product_name"] is None and "grams_bought" not in unknown
    assert "dragon fruit powder" in meal["evaluation"]["pack"]["unpriced"]
    assert meal["evaluation"]["status"] == "issues"


def test_unpriced_lines_still_show_packs_and_leftovers():
    by = lines(run())
    rice = by["arroz"]
    assert (rice["packs_to_buy"], rice["grams_bought"], rice["grams_left"]) == (1, 1000, 840)
    assert rice["leftover_status"] == "keeps" and rice["price_source"] == "typical" and rice["has_price"] is False
    assert rice["cost_bought_eur"] is None and rice["product_url"] is None
    cucumber = by["cucumber"]
    assert cucumber["sold_by"] == "per_kg" and cucumber["grams_bought"] == 1000
    assert cucumber["leftover_pct"] == pytest.approx(84.0) and cucumber["leftover_status"] == "use_in_2_days"


def test_fresh_food_with_low_leftovers_takes_the_typical_size_that_buys_fewest_grams():
    by = lines(run())
    chicken = by["Chicken Breast"]
    assert (chicken["product_name"], chicken["grams_bought"], chicken["grams_left"]) == ("chicken breast 400 g", 400, 100)
    eggs = by["eggs"]  # 2 eggs: the 6-pack, counted in units of 51 g
    assert (eggs["units_needed"], eggs["units_bought"], eggs["grams_bought"], eggs["grams_left"]) == (2, 6, 306, 204)
    # Without "keep leftovers low" the most common size is bought
    plain = lines(run(form={**FORM, "keep_leftovers_low": False}))
    assert plain["Chicken Breast"]["grams_bought"] == 500 and plain["eggs"]["units_bought"] == 12


def test_high_leftover_on_unpriced_fresh_lines_asks_for_a_change():
    meal = run()
    reasons = [(r["reason"], r["ingredient"]) for r in meal["evaluation"]["change_requests"]]
    assert ("high_leftover", "cucumber") in reasons
    assert ("high_leftover", "Chicken Breast") not in reasons  # 25% left is not over 25%
    used_later = {**RECIPE, "ingredients": [ing("cucumber", 80, "fresh", leftover_plan="use_in_another_meal")]}
    meal = run(recipe=used_later)
    assert lines(meal)["cucumber"]["leftover_status"] == "use_in_another_meal"
    assert not [r for r in meal["evaluation"]["change_requests"] if r["reason"] == "high_leftover"]


def test_optional_items_are_flagged_and_left_out_of_the_budget_check():
    by = lines(run())
    assert by["salt"]["optional"] is True  # pantry
    assert by["lemon juice"]["optional"] is True  # bottled juice
    assert by["arroz"]["optional"] is False
    pack = run()["evaluation"]["pack"]
    assert "salt" not in pack["unpriced"] and "lemon juice" not in pack["unpriced"]
    assert {"salt", "black pepper", "extra virgin olive oil", "vinegar", "soy sauce", "lemon juice"} <= OPTIONAL_FOODS


def test_pantry_item_with_no_pack_size_gets_no_line():
    recipe = {**RECIPE, "ingredients": [ing("rice", 80, dry=True), ing("cumin", 1, pantry=True)]}
    assert set(lines(run(recipe=recipe))) == {"rice"}


def test_macros_per_serving_and_total_count_what_is_eaten():
    macros = run()["evaluation"]["macros"]
    kcal = 330 + 560 + 24 + 142.8 + 0 + 4.4  # chicken 300 g, rice 160 g, cucumber 160 g, 2 eggs 102 g, salt, juice 20 g
    protein = 69 + 11.2 + 1.12 + 13.056 + 0.08
    assert macros["total"]["kcal"] == pytest.approx(kcal, abs=0.01)
    assert macros["per_serving"]["kcal"] == pytest.approx(kcal / 2, abs=0.01)
    assert macros["per_serving"]["protein_g"] == pytest.approx(protein / 2, abs=0.01)
    eggs = next(l for l in macros["lines"] if l["name"] == "eggs")
    assert eggs["grams"] == 102 and eggs["source"] == "ciqual"


def test_misses_vs_targets():
    misses = run()["evaluation"]["macros"]["misses"]  # 531 kcal, 47 g protein, 66 g carbs per serving
    assert misses == ["kcal 531 vs target 450", "carbs 66 g over max 50 g"]
    meal = run()
    assert any(r["reason"] == "misses_macros" for r in meal["evaluation"]["change_requests"])
    ok = {**FORM, "kcal_target": 530, "carbs_g_max": None}
    assert run(form=ok)["evaluation"]["macros"]["misses"] == []
    low = run(form={**ok, "protein_g_target": 60})["evaluation"]["macros"]["misses"]
    assert low == ["protein 47 g vs target 60 g"]
    high = run(form={**ok, "protein_g_target": 30})["evaluation"]["macros"]["misses"]
    assert high == ["protein 47 g is more than 20% over target 30 g: cut the protein ingredient"]
    fat = run(form={**ok, "fat_g_max": 5})["evaluation"]["macros"]["misses"]
    assert fat == ["fat 8 g over max 5 g"]  # (4.5 + 1.6 + 0.16 + 10.0 + 0.04) / 2


def test_known_food_without_a_nutrition_record_is_listed():
    recipe = {**RECIPE, "ingredients": [ing("rice", 80, dry=True), ing("greek yogurt 0%", 100, "fresh")]}
    macros = run(recipe=recipe)["evaluation"]["macros"]
    assert macros["missing_nutrition"] == ["greek yogurt 0%: no nutrition record, left out of the totals"]
    assert macros["unresolved"] == []


def test_user_prices_run_the_budget_check():
    meal = run(form={**FORM, "budget_total_eur": 4}, prices={"chicken breast": 5.0})
    pack = meal["evaluation"]["pack"]
    chicken = lines(meal)["Chicken Breast"]
    assert chicken["has_price"] is True and chicken["price_source"] == "user" and chicken["cost_bought_eur"] == 5.0
    assert pack["cart_total_eur"] == 5.0 and pack["within_budget"] is False
    assert pack["budget_check_complete"] is False  # other bought lines have no price
    assert any(r["reason"] == "over_budget" for r in pack["change_requests"])
    assert validate_output(meal, "meal.schema.json") == []


def test_no_prices_means_an_incomplete_budget_check_that_passes():
    pack = run()["evaluation"]["pack"]
    assert pack["cart_total_eur"] == 0 and pack["within_budget"] is True and pack["budget_check_complete"] is False
    assert pack["waste_grams"] == 100 + 840 + 840 + 204  # leftovers of every bought line with a pack size


def test_mfp_block_marks_dry_and_raw_grams():
    mfp = run()["mfp"].splitlines()
    assert mfp[:2] == ["SmartBite: Chicken rice bowl", "Servings: 2"]
    assert "arroz, 160 g (dry)" in mfp and "Chicken Breast, 300 g (raw)" in mfp and "eggs, 102 g" in mfp
    assert mfp_mark("canned chickpeas") == "" and mfp_mark("wholemeal pasta") == " (dry)"
    assert mfp_mark("quinoa", dry=True) == " (dry)"


def test_mfp_block_keeps_a_pinch_under_1_g_and_drops_0_g_lines():
    items = [{"name": "chili flakes", "food": "chili flakes", "total_grams": 0.3, "dry": False},
             {"name": "salt", "food": "salt", "total_grams": 0.02, "dry": False},
             {"name": "black pepper", "food": "black pepper", "total_grams": 2.4, "dry": False}]
    assert mfp_block("T", 1, items).splitlines() == ["SmartBite: T", "Servings: 1", "", "chili flakes, 0.3 g",
                                                     "black pepper, 2 g (raw)"]


def test_form_rules_are_checked():
    with pytest.raises(ValueError):
        run(form={**FORM, "servings": 9})
