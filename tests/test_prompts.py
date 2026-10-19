import copy
import json
import re

import pytest

from smartbite_engine.form import MealForm
from smartbite_engine.meal import evaluate
from smartbite_engine.prompts import (PROMPTS, default_profile, fill, form_text, gram_limits, idea_prompt,
                                      load_template, pack_hint_foods, pack_hints_for, recipe_prompt, render_profile,
                                      rerun_info, revision_prompt, target_ranges)

FORM = {"craving": "Greek chicken bowl", "servings": 4, "budget_total_eur": 20, "kcal_target": 450,
        "protein_g_target": 45, "keep_leftovers_low": True, "exclude": ["feta"], "gear": ["oven", "no_blender"],
        "reheat_at_work": True, "fat_g_max": 15}
IDEA = {"idea_id": "2", "name": "Greek chicken bowl", "one_line": "Chicken, rice and cucumber.",
        "main_ingredients": ["chicken breast", "rice", "cucumber"],
        "rough_macros": {"kcal": 450, "protein_g": 45, "carbs_g": 40, "fat_g": 12}, "image_prompt": "a bowl",
        "changes": "no tomato"}


def every_prompt():
    return {"idea": idea_prompt(FORM, inspiration=[], known_ingredients=["rice"]),
            "revision": revision_prompt(FORM, IDEA, "more cucumber"),
            "recipe": recipe_prompt(FORM, IDEA, known_ingredients=["rice", "chicken breast"])}


@pytest.mark.parametrize("name", ["idea", "revision", "recipe"])
def test_template_has_system_and_user_and_no_comments_left(name):
    template = load_template(name)
    assert template["system"] and template["user"]
    assert "<!--" not in template["system"] + template["user"]


def test_every_placeholder_is_filled():
    for name, prompt in every_prompt().items():
        for part in ("system", "user"):
            assert not re.search(r"\{\{\w+\}\}", prompt[part]), (name, part)


def test_fill_refuses_a_missing_value():
    with pytest.raises(KeyError):
        fill("Hello {{name}} {{city}}", {"name": "x"})


def test_profile_renders_every_non_empty_field():
    profile = default_profile()
    text = render_profile(profile)
    for section in profile["sections"]:
        for field in section["fields"]:
            if field["type"] == "text" and field["value"]:
                assert field["value"] in text
    assert "About 450 kcal per meal" in text and "About 45 g protein per meal" in text
    assert "Kitchen:\n- Small fridge" in text
    assert "Proteins I like" not in text  # empty list field is left out


def test_editing_a_profile_field_changes_the_prompt():
    profile = copy.deepcopy(default_profile())
    fields = {f["id"]: f for s in profile["sections"] for f in s["fields"]}
    fields["kcal_target"]["value"] = 600
    fields["gear"]["value"] = "Blender and air fryer."
    fields["proteins"]["value"] = ["tofu", "eggs"]
    fields["dressings"]["value"] = ""
    text = idea_prompt(FORM, profile=profile)["system"]
    assert "About 600 kcal per meal" in text
    assert "Blender and air fryer." in text and "No blender." not in text
    assert "Proteins I like: tofu, eggs." in text
    assert "mayonnaise" not in text


def test_section_with_only_empty_fields_is_skipped():
    profile = copy.deepcopy(default_profile())
    for s in profile["sections"]:
        if s["id"] == "budget":
            for f in s["fields"]:
                f["value"] = ""
    assert "Budget:" not in render_profile(profile)


def test_default_profile_has_no_city_store_or_person():
    text = (PROMPTS / "kitchen-profile.default.json").read_text(encoding="utf-8").lower()
    for word in ("mercadona", "carrefour", "lidl", " she ", " her "):
        assert word not in text
    for path in PROMPTS.glob("*.md"):
        body = path.read_text(encoding="utf-8").lower()
        assert chr(0x2014) not in body and "{{ " not in body


def test_idea_rules_are_in_the_idea_prompt():
    system = every_prompt()["idea"]["system"]
    for rule in ("exactly 4 ideas", "real dish", "one main protein", "at most 60 characters",
                 "The recipe will keep every one of them", "The form wins over the Kitchen Profile"):
        assert rule.lower() in system.lower(), rule


def test_recipe_rules_are_in_the_recipe_prompt():
    system = every_prompt()["recipe"]["system"]
    for rule in ("Keep every food in the idea's main_ingredients", "in grams per serving", "Never invent macros",
                 "DRY (uncooked) weight", "Rice, pasta, quinoa and couscous", "units_per_serving (eggs per serving",
                 "They win over the Kitchen Profile"):
        assert rule in system, rule


def test_revision_prompt_says_changes_win_and_carries_them():
    p = every_prompt()["revision"]
    assert "changes win over the Kitchen Profile" in p["system"]
    assert "more cucumber" in p["user"] and '"idea_id": "2"' in p["user"]


def test_form_text_lists_the_form():
    text = form_text(FORM)
    assert "Craving: Greek chicken bowl" in text and "Servings: 4" in text
    assert "Foods I do NOT want: feta" in text and "Fat max per serving: 15 g" in text
    assert "5.00 EUR per serving" in text and "Cooking gear: oven, no blender" in text
    assert "Carbs max" not in text


def test_form_text_takes_a_meal_form_too():
    form = MealForm(craving="lentejas", servings=2, budget_total_eur=10, exclude=("cebolla",))
    text = form_text(form)
    assert "Craving: lentejas" in text and "Foods I do NOT want: cebolla" in text


def test_recipe_prompt_lists_known_ingredients_idea_and_servings():
    user = every_prompt()["recipe"]["user"]
    assert "rice, chicken breast" in user
    assert json.dumps(IDEA, ensure_ascii=False) in user
    assert user.endswith("Write the full recipe for 4 servings.")
    assert "YOUR PREVIOUS RECIPE" not in user


def test_recipe_retry_carries_previous_recipe_and_problems():
    previous = {"title": "Old bowl", "servings": 4}
    rerun = {"attempt": 2, "max_attempts": 3, "previous": previous, "change_requests": [
        {"from_agent": "macro", "ingredient": None, "reason": "misses_macros", "hint": "add 10 g protein"}]}
    user = recipe_prompt(FORM, IDEA, rerun=rerun, pack_hints=[
        {"ingredient": "pechuga de pollo", "pack_grams": 500, "sold_by": "pack"},
        {"ingredient": "potato", "pack_grams": 1000, "sold_by": "per_kg"}, "eggs: 12 units"])["user"]
    assert "RERUN: attempt 2 of 3." in user
    assert '{"title": "Old bowl", "servings": 4}' in user
    assert "PROBLEMS TO FIX:\n- misses_macros (meal): add 10 g protein" in user
    assert "- chicken breast: 500 g pack" in user and "- potato: loose, sold per 1000 g" in user
    assert "- eggs: 12 units" in user
    assert not re.search(r"\n{3,}", user)


def ing(name, grams, units=0, storage="fresh", pantry=False, dry=False, **extra):
    return {"name": name, "grams_per_serving": grams, "units_per_serving": units, "storage": storage,
            "pantry": pantry, "dry": dry, **extra}


RERUN_FORM = {"craving": "chicken bowl", "servings": 2, "budget_total_eur": 10, "kcal_target": 450,
              "protein_g_target": 45, "keep_leftovers_low": True, "fat_g_max": 15}
FIRST = {"idea_id": "2", "title": "Bowl", "servings": 2, "prep_time_min": 30, "steps": ["Cook."], "ingredients": [
    ing("chicken breast", 170), ing("rice", 70, storage="keeps", dry=True), ing("eggs", 51, units=1),
    ing("cucumber", 100), ing("extra virgin olive oil", 10, storage="keeps", pantry=True), ing("dragon fruit", 50)]}


def test_form_states_the_ok_ranges_like_the_macro_check():
    assert "Targets per serving: 450 kcal (OK from 405 to 495), 45 g protein (OK from 41 to 54 g)" in form_text(FORM)
    # Rounded inward, and 1.2 x 40 = 47.999... still gives 48
    assert target_ranges({"kcal_target": 500, "protein_g_target": 40}) == {"kcal": (450, 550), "protein_g": (36, 48)}
    assert target_ranges({"kcal_target": 333, "protein_g_target": 33}) == {"kcal": (300, 366), "protein_g": (30, 39)}


def test_gram_limits_cap_bought_foods_at_15_percent_of_the_first_recipe():
    limits = {l["name"]: l for l in gram_limits(FIRST)}
    assert limits["chicken breast"]["max_grams"] == 195  # 170 x 1.15 = 195.5, rounded down
    assert limits["rice"]["max_grams"] == 80
    assert limits["eggs"] == {"name": "eggs", "first_units": 1, "max_units": 1.1}
    assert "extra virgin olive oil" not in limits  # pantry items change freely


def test_rerun_block_from_the_engine_evaluation():
    meal = evaluate(RERUN_FORM, IDEA, FIRST)
    rerun = rerun_info(meal, FIRST, 2)
    assert rerun["attempt"] == 2 and rerun["max_attempts"] == 3 and rerun["previous"] is FIRST
    assert rerun["unresolved"] == ["dragon fruit"]
    chicken = next(l for l in rerun["lines"] if l["name"] == "chicken breast")
    assert chicken["grams"] == 170 and 30 < chicken["protein_g"] < 45  # per serving, not for both servings
    user = recipe_prompt(RERUN_FORM, IDEA, rerun=rerun)["user"]
    assert "MACROS PER SERVING, COMPUTED IN CODE:\n- chicken breast, 170 g: " in user
    assert "\nTotal: " in user and "OK ranges: kcal 405 to 495, protein 41 to 54 g, fat at most 15 g" in user
    assert "Unknown foods, left out of the totals (use a name from KNOWN INGREDIENTS): dragon fruit" in user
    assert "- chicken breast: at most 195 g (first recipe 170 g)" in user
    assert "- eggs: at most 1.1 eggs (first recipe 1)" in user
    for r in meal["evaluation"]["change_requests"]:
        assert f"- {r['reason']} ({r['ingredient'] or 'meal'})" in user
    assert user.endswith("Write the full recipe for 2 servings.")


def test_pack_hints_only_for_the_idea_foods_and_the_last_recipe():
    assert [h["ingredient"] for h in pack_hints_for(pack_hint_foods(IDEA))] == ["chicken breast", "cucumber", "rice"]
    rerun = {"previous": FIRST}
    names = [h["ingredient"] for h in pack_hints_for(pack_hint_foods(IDEA, rerun))]
    assert names == ["chicken breast", "cucumber", "eggs", "rice"]  # no pantry oil, no unknown food
    assert pack_hints_for(["pechuga de pollo", "chicken breast"]) == [
        {"ingredient": "chicken breast", "sold_by": "pack", "pack_grams": 500, "units_per_pack": None}]
    assert pack_hints_for([]) == []


def test_new_rules_are_in_the_prompts():
    idea, recipe = every_prompt()["idea"]["system"], every_prompt()["recipe"]["system"]
    revision = every_prompt()["revision"]["system"]
    for text in (idea, revision):
        assert 'write "lemon juice" (or "lime juice") in main_ingredients' in text
        assert "no pantry items (salt, pepper, dried spices and herbs, oil, vinegar)" in text
        assert "targets, reheating, gear and time limit come from the form" in text
        assert "is not a second protein" in text
    assert "legumes when they are the main source" in idea
    assert "A legume side in a meat or fish dish only when the dish has it by tradition" in idea
    assert "pantry is true only for salt, pepper, dried spices, dried herbs, oil and vinegar" in recipe
    assert "(soy sauce, teriyaki sauce, mustard, lemon juice, lime juice) are pantry false" in recipe
    assert "hit protein first, then bring kcal into its range by changing the carb and fat foods" in recipe
    assert "GRAM LIMITS gives the maximum" in recipe
    assert 'Optional fields: "note" on the recipe' in recipe and "Add no other fields." in recipe


def test_prompt_optional_foods_match_the_engine():
    """Every sauce and juice the recipe prompt calls an optional buy is optional in meal.py, and garlic is not."""
    from smartbite_engine.meal import OPTIONAL_FOODS
    for food in ("soy sauce", "teriyaki sauce", "mustard", "lemon juice", "lime juice"):
        assert food in OPTIONAL_FOODS
    assert "garlic" not in OPTIONAL_FOODS


def test_inspiration_is_listed_in_the_idea_prompt():
    dish = {"name": "Shakshuka", "cuisine": "Middle Eastern", "style": "stew", "core": ["eggs", "tomate"],
            "method": "Poach eggs in tomato sauce."}
    user = idea_prompt(FORM, inspiration=[dish])["user"]
    assert "- Shakshuka (Middle Eastern, stew): eggs, tomato. Poach eggs in tomato sauce." in user


def test_known_ingredients_are_listed_in_english_once():
    user = recipe_prompt(FORM, IDEA, known_ingredients=["arroz", "Pechuga de pollo", "chicken breast", "dragon fruit"])["user"]
    assert "rice, chicken breast, dragon fruit" in user
    assert "KNOWN INGREDIENTS (English names" in user


@pytest.mark.parametrize("name", ["idea", "revision", "recipe"])
def test_prompts_ask_for_english_food_names_and_text_in_the_craving_language(name):
    system = load_template(name)["system"]
    assert "in English, whatever the language of the craving" in system
    assert "in the language of the craving" in system.replace("in English, whatever the language of the craving", "")
