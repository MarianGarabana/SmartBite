import copy
import json

import pytest

from eval.checks import (CHECKS, FAIL, PASS, SKIP, banned_words, check_case, check_macros, load_per_100g,
                         macros_per_serving, per_100g_table)
from eval.run import case_prompt, load_cases, score
from smartbite_engine.contracts import validate_output
from smartbite_engine.form import MealForm

CASE = {"id": "t1", "form": {"craving": "chicken fried rice", "servings": 4, "budget_total_eur": 20,
                             "kcal_target": 450, "protein_g_target": 45, "keep_leftovers_low": True,
                             "exclude": ["mushroom", "onion"]}}
MACROS = {"kcal": 450, "protein_g": 45, "carbs_g": 40, "fat_g": 12}


def idea(n, name="Chicken fried rice", main=("chicken breast", "rice", "eggs", "frozen peas")):
    return {"idea_id": n, "name": name, "one_line": "Fried rice with chicken, egg and peas.",
            "main_ingredients": list(main), "rough_macros": MACROS, "image_prompt": "a bowl of fried rice"}


def ing(name, grams, units=0, storage="fresh", pantry=False, dry=False, **extra):
    return {"name": name, "grams_per_serving": grams, "units_per_serving": units, "storage": storage,
            "pantry": pantry, "dry": dry, **extra}


def good_reply():
    ideas = {"ideas": [idea("1"), idea("2", "Greek chicken bowl", ("chicken breast", "rice", "cucumber")),
                       idea("3", "Chicken tikka", ("chicken breast", "crushed tomatoes")),
                       idea("4", "Chicken Cobb salad", ("chicken breast", "eggs", "lettuce"))]}
    recipe = {"idea_id": "1", "title": "Chicken fried rice", "servings": 4, "prep_time_min": 35, "ingredients": [
        ing("chicken breast", 150), ing("rice", 70, storage="keeps", dry=True),
        ing("eggs", 51, units=1), ing("frozen peas", 60, storage="frozen"),
        ing("soy sauce", 10, storage="keeps"), ing("extra virgin olive oil", 5, storage="keeps", pantry=True)],
        "steps": ["Cook the rice.", "Fry everything."]}
    return {"ideas": json.dumps(ideas), "picked_idea_id": "1", "recipe": recipe}


def statuses(reply, table=None, case=CASE):
    return {r["check"]: r["status"] for r in check_case(case, reply, table)}


def failed(reply, check, case=CASE):
    r = next(r for r in check_case(case, reply) if r["check"] == check)
    assert r["status"] == FAIL, r
    return r["detail"]


def test_good_reply_passes_every_check_and_macros_skip_without_table():
    got = statuses(good_reply())
    assert list(got) == list(CHECKS)
    assert got.pop("macros_vs_target") == SKIP
    assert set(got.values()) == {PASS}


def test_invalid_json_text_fails_the_contract():
    reply = good_reply()
    reply["ideas"] = reply["ideas"] + "\nHope you like them!"
    assert "extra text" in failed(reply, "ideas_json")


def test_recipe_contract_failure():
    reply = good_reply()
    reply["recipe"]["ingredients"][0]["storage"] = "fridge"
    assert "storage" in failed(reply, "recipe_json")


def test_three_ideas_fail():
    reply = good_reply()
    data = json.loads(reply["ideas"])
    data["ideas"] = data["ideas"][:3]
    reply["ideas"] = data
    assert failed(reply, "four_ideas") == "got 3 ideas"


def test_long_idea_name_fails():
    reply = good_reply()
    data = json.loads(reply["ideas"])
    data["ideas"][2]["name"] = "A very long chicken tikka masala with spinach, rice and yogurt sauce"
    reply["ideas"] = data
    assert "(68)" in failed(reply, "idea_names_60")


def test_wrong_servings_fail():
    reply = good_reply()
    reply["recipe"]["servings"] = 3
    assert failed(reply, "recipe_servings") == "servings 3, form asks 4"


def test_dropped_main_ingredient_fails():
    reply = good_reply()
    reply["recipe"]["ingredients"] = [i for i in reply["recipe"]["ingredients"] if i["name"] != "frozen peas"]
    assert failed(reply, "keeps_main_ingredients") == "dropped: frozen peas"


def test_main_ingredient_kept_by_first_word():
    reply = good_reply()
    reply["recipe"]["ingredients"][0]["name"] = "chicken breast fillets"
    assert statuses(reply)["keeps_main_ingredients"] == PASS


def test_main_ingredient_kept_under_its_spanish_name():
    reply = good_reply()
    reply["recipe"]["ingredients"][3]["name"] = "guisantes congelados"
    assert statuses(reply)["keeps_main_ingredients"] == PASS


def test_recipe_is_checked_against_the_picked_idea():
    reply = good_reply()
    reply["picked_idea_id"] = "2"  # Greek bowl needs cucumber, the recipe has none
    assert "cucumber" in failed(reply, "keeps_main_ingredients")


@pytest.mark.parametrize("food", ["champiñones laminados", "cebolla", "Spring onion", "mushrooms"])
def test_excluded_food_in_the_recipe_fails_in_either_language(food):
    reply = good_reply()
    reply["recipe"]["ingredients"].append(ing(food, 40))
    assert food in failed(reply, "no_excluded_food")


def test_excluded_food_in_an_idea_fails():
    reply = good_reply()
    data = json.loads(reply["ideas"])
    data["ideas"][3]["main_ingredients"].append("champiñón")
    reply["ideas"] = data
    assert "champiñón" in failed(reply, "no_excluded_food")


def test_exclusion_cross_language_uses_the_food_head():
    words = banned_words(["chicken"])
    assert {"pollo"} in words
    assert {"chicken"} in words


def test_no_exclusions_passes():
    case = {**CASE, "form": {**CASE["form"], "exclude": []}}
    assert statuses(good_reply(), case=case)["no_excluded_food"] == PASS


@pytest.mark.parametrize("name,dry,note,status", [
    ("arroz", False, None, FAIL), ("arroz basmati (dry)", False, None, PASS), ("pasta integral", False, "dry weight", PASS),
    ("quinoa", True, None, PASS), ("cuscús", False, None, FAIL), ("couscous", False, "peso en seco", PASS),
    ("arroz cocido microondas", False, None, PASS), ("vinagre de arroz", False, None, PASS),
    ("pasta de curry rojo", False, None, PASS)])
def test_dry_grams(name, dry, note, status):
    reply = good_reply()
    extra = {"note": note} if note else {}
    reply["recipe"]["ingredients"][1] = ing(name, 70, storage="keeps", dry=dry, **extra)
    assert statuses(reply)["dry_grams"] == status


@pytest.mark.parametrize("item,status", [
    (ing("huevos", 102, units=2), PASS), (ing("huevos camperos L", 120, units=2), PASS),
    (ing("huevos", 100), FAIL), (ing("eggs", 200, units=2), FAIL), (ing("claras de huevo", 100), PASS),
    (ing("pasta al huevo", 80, storage="keeps", dry=True), PASS), (ing("pepino", 80, units=1), FAIL)])
def test_eggs_in_units(item, status):
    reply = good_reply()
    reply["recipe"]["ingredients"][2] = item
    reply["recipe"]["ingredients"].append(ing("extra egg", 51, units=1))  # keeps the idea's "eggs"
    assert statuses(reply)["eggs_in_units"] == status


def test_missing_grams_fail():
    reply = good_reply()
    del reply["recipe"]["ingredients"][4]["grams_per_serving"]
    assert "soy sauce" in failed(reply, "grams_every_ingredient")


def test_no_reply_fails_without_crashing():
    got = statuses({})
    assert got["ideas_json"] == FAIL and got["recipe_json"] == FAIL and got["grams_every_ingredient"] == FAIL


# Spanish keys on purpose: the table and the English recipe names meet on the English key (data/open/aliases.json)
FOODS = {"pechuga de pollo": {"kcal": 110, "protein_g": 23, "carbs_g": 0, "fat_g": 1.5},
         "arroz": {"kcal": 350, "protein_g": 7, "carbs_g": 78, "fat_g": 0.6},
         "huevos": {"per_100g": {"kcal": 140, "protein_g": 12.5, "carbs_g": 0.7, "fat_g": 9.7}},
         "guisantes congelados": {"kcal": 80, "protein_g": 5.4, "carbs_g": 10, "fat_g": 0.4},
         "salsa de soja": {"kcal": 60, "protein_g": 8, "carbs_g": 6, "fat_g": 0},
         "aceite de oliva virgen extra": {"kcal": 900, "protein_g": 0, "carbs_g": 0, "fat_g": 100}}


def test_macros_per_serving_from_the_table():
    per, missing = macros_per_serving(good_reply()["recipe"]["ingredients"], per_100g_table(FOODS))
    assert missing == []
    # 150 g chicken 165 kcal + 70 g rice 245 + 1 egg (51 g) 71.4 + 60 g peas 48 + 10 g soy 6 + 5 g oil 45
    assert per.kcal == pytest.approx(580.4)
    assert per.protein_g == pytest.approx(34.5 + 4.9 + 6.375 + 3.24 + 0.8)


def test_macro_check_fails_when_over_kcal_and_low_protein():
    r = check_macros(good_reply()["recipe"]["ingredients"], CASE["form"], per_100g_table(FOODS))
    assert r["status"] == FAIL
    assert "kcal 580 vs target 450" in r["detail"] and "protein 50 g" not in r["detail"]


def test_macro_check_passes_on_target():
    form = {**CASE["form"], "kcal_target": 580, "protein_g_target": 50}
    r = check_macros(good_reply()["recipe"]["ingredients"], form, per_100g_table(FOODS))
    assert r["status"] == PASS, r


def test_macro_check_skips_food_missing_from_table():
    foods = {k: v for k, v in FOODS.items() if k != "arroz"}
    r = check_macros(good_reply()["recipe"]["ingredients"], CASE["form"], per_100g_table(foods))
    assert r["status"] == SKIP and "rice" in r["detail"]


def test_load_per_100g_skips_cleanly_when_file_is_missing(tmp_path):
    assert load_per_100g(tmp_path / "per-100g.json") is None
    path = tmp_path / "per-100g.json"
    path.write_text(json.dumps({"note": "test", "foods": {"Arroz": FOODS["arroz"]}}), encoding="utf-8")
    assert set(load_per_100g(path)) == {"rice"}


def test_golden_set_has_15_varied_valid_cases():
    cases = load_cases()
    assert len(cases) == 15 and len({c["id"] for c in cases}) == 15
    for c in cases:
        assert validate_output(c["form"], "common.schema.json", "MealForm") == [], c["id"]
        MealForm(**c["form"])
    tags = {t for c in cases for t in c["tags"]}
    assert {"vegetarian", "exclusions", "tight kcal", "one serving", "six servings"} <= tags
    assert {c["language"] for c in cases} == {"en", "es"}
    assert any(c["form"]["servings"] == 1 for c in cases) and any(c["form"]["servings"] == 6 for c in cases)
    assert any(c["form"]["kcal_target"] <= 350 for c in cases)
    proteins = {"chicken", "salmon", "canned tuna", "ground beef", "turkey", "pork", "eggs", "legumes", "white fish"}
    assert proteins <= tags


def test_score_writes_results_markdown(tmp_path):
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps({"cases": [CASE, {**CASE, "id": "t2"}]}), encoding="utf-8")
    run_dir = tmp_path / "replies" / "base"
    run_dir.mkdir(parents=True)
    (run_dir / "t1.json").write_text(json.dumps(good_reply()), encoding="utf-8")
    nutrition = tmp_path / "nutrition.json"
    summary = score("base", golden=golden, replies=tmp_path / "replies", results=tmp_path / "results",
                    nutrition=nutrition, today="2026-10-19")
    assert summary["missing"] == ["t2"]
    assert summary["passed"] == 10 and summary["failed"] == 11 and summary["skipped"] == 1
    text = (tmp_path / "results" / "base.md").read_text(encoding="utf-8")
    assert text.startswith("# Eval run: base")
    assert "Score: 10/21 checks passed (47.6%)" in text
    assert "| t1 | ok | ok |" in text and "t2, ideas_json (fail): no reply file" in text
    assert "Macro check skipped" in text
    assert chr(0x2014) not in text


def test_score_uses_the_nutrition_table_when_it_exists(tmp_path):
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps({"cases": [CASE]}), encoding="utf-8")
    (tmp_path / "replies" / "r").mkdir(parents=True)
    (tmp_path / "replies" / "r" / "t1.json").write_text(json.dumps(good_reply()), encoding="utf-8")
    nutrition = tmp_path / "per-100g.json"
    nutrition.write_text(json.dumps({"foods": FOODS}), encoding="utf-8")
    summary = score("r", golden=golden, replies=tmp_path / "replies", results=tmp_path / "out", nutrition=nutrition)
    assert summary["counts"]["macros_vs_target"][FAIL] == 1 and summary["skipped"] == 0


def test_case_prompt_for_idea_and_recipe(tmp_path):
    p = case_prompt("c06-chicken-pasta-exclude", "idea")
    assert "Foods I do NOT want: mushroom, onion" in p["user"] and "INSPIRATION" in p["user"]
    run_dir = tmp_path / "x"
    run_dir.mkdir()
    (run_dir / "c06-chicken-pasta-exclude.json").write_text(json.dumps(good_reply()), encoding="utf-8")
    r = case_prompt("c06-chicken-pasta-exclude", "recipe", "x", replies=tmp_path)
    assert '"idea_id": "1"' in r["user"] and r["user"].endswith("Write the full recipe for 4 servings.")


def test_specific_variant_keeps_the_general_main_food():
    reply = good_reply()
    reply["ideas"] = json.dumps({"ideas": [idea("1", main=("chicken breast", "arroz", "eggs", "tomate")),
                                           *json.loads(good_reply()["ideas"])["ideas"][1:]]})
    reply["recipe"]["ingredients"][1]["name"] = "basmati rice"
    reply["recipe"]["ingredients"][3] = ing("cherry tomatoes", 60)
    assert statuses(reply)["keeps_main_ingredients"] == PASS
    reply["recipe"]["ingredients"][1]["name"] = "quinoa"
    assert failed(reply, "keeps_main_ingredients") == "dropped: arroz"


def test_general_food_does_not_keep_a_specific_main_food():
    reply = good_reply()
    reply["ideas"] = json.dumps({"ideas": [idea("1", main=("chicken breast", "basmati rice", "eggs", "frozen peas")),
                                           *json.loads(good_reply()["ideas"])["ideas"][1:]]})
    reply["recipe"]["ingredients"][1]["name"] = "rice"
    assert failed(reply, "keeps_main_ingredients") == "dropped: basmati rice"


def test_reruns_are_scored_on_the_last_recipe():
    reply = good_reply()
    first = copy.deepcopy(reply["recipe"])
    first["servings"] = 3
    fixed = copy.deepcopy(reply["recipe"])
    reply["recipe"], reply["reruns"] = first, [json.dumps(fixed)]
    assert statuses(reply)["recipe_servings"] == PASS
    reply["reruns"].append({**fixed, "servings": 5})
    assert failed(reply, "recipe_servings") == "servings 5, form asks 4"


def test_score_reports_attempts_and_first_recipe_macros(tmp_path):
    golden = tmp_path / "golden.json"
    golden.write_text(json.dumps({"cases": [CASE, {**CASE, "id": "t2"}]}), encoding="utf-8")
    run_dir = tmp_path / "replies" / "r"
    run_dir.mkdir(parents=True)
    rerun = good_reply()
    rerun["reruns"] = [copy.deepcopy(rerun["recipe"]), copy.deepcopy(rerun["recipe"])]
    (run_dir / "t1.json").write_text(json.dumps(rerun), encoding="utf-8")
    (run_dir / "t2.json").write_text(json.dumps(good_reply()), encoding="utf-8")
    summary = score("r", golden=golden, replies=tmp_path / "replies", results=tmp_path / "out",
                    nutrition=tmp_path / "none.json", today="2026-10-19")
    assert summary["attempts"] == {"t1": 3, "t2": 1}
    text = (tmp_path / "out" / "r.md").read_text(encoding="utf-8")
    assert "Recipe attempts: 1 of 2 cases have reruns (2 reruns in all)." in text
    assert "macros_vs_target on the first recipe: 0 pass, 0 fail, 2 skip; on the last: 0 pass, 0 fail, 2 skip." in text
    assert "| attempts |" in text and text.count(" | 3 |") == 1 and text.count(" | 1 |") == 1


def test_case_prompt_for_a_rerun(tmp_path):
    run_dir = tmp_path / "x"
    run_dir.mkdir()
    reply = good_reply()
    reply["recipe"]["ingredients"][0]["grams_per_serving"] = 260  # far over the protein target
    (run_dir / "c06-chicken-pasta-exclude.json").write_text(json.dumps(reply), encoding="utf-8")
    p = case_prompt("c06-chicken-pasta-exclude", "rerun", "x", replies=tmp_path)
    user = p["user"]
    assert "RERUN: attempt 2 of 3." in user and '"grams_per_serving": 260' in user
    assert "MACROS PER SERVING, COMPUTED IN CODE:\n- chicken breast, 260 g: " in user
    assert "is more than 20% over target" in user
    assert "- chicken breast: at most 299 g (first recipe 260 g)" in user
    assert "- eggs: at most 1.1 eggs (first recipe 1)" in user
    hints = user.split("PACK SIZES (use whole packs fully when you can):\n")[1].split("\n\n")[0]
    assert "- chicken breast: 500 g pack" in hints and "extra virgin olive oil" not in hints
    assert user.endswith("Write the full recipe for 4 servings.")

    # Attempt 3 starts from the stored rerun; the 15% cap still counts from the first recipe
    fixed = copy.deepcopy(reply["recipe"])
    fixed["ingredients"][0]["grams_per_serving"] = 140
    reply["reruns"] = [fixed]
    (run_dir / "c06-chicken-pasta-exclude.json").write_text(json.dumps(reply), encoding="utf-8")
    user = case_prompt("c06-chicken-pasta-exclude", "rerun", "x", replies=tmp_path)["user"]
    assert "RERUN: attempt 3 of 3." in user and "- chicken breast, 140 g: " in user
    assert "- chicken breast: at most 299 g (first recipe 260 g)" in user
    assert "RERUN: attempt 2 of 3." in case_prompt("c06-chicken-pasta-exclude", "rerun", "x", attempt=2,
                                                   replies=tmp_path)["user"]
    with pytest.raises(ValueError, match="attempt must be 2 to 3"):
        case_prompt("c06-chicken-pasta-exclude", "rerun", "x", attempt=4, replies=tmp_path)


def test_case_prompt_for_the_recipe_lists_pack_sizes_of_the_main_foods_only(tmp_path):
    run_dir = tmp_path / "x"
    run_dir.mkdir()
    (run_dir / "c06-chicken-pasta-exclude.json").write_text(json.dumps(good_reply()), encoding="utf-8")
    user = case_prompt("c06-chicken-pasta-exclude", "recipe", "x", replies=tmp_path)["user"]
    hints = user.split("PACK SIZES (use whole packs fully when you can):\n")[1].split("\n\n")[0]
    assert [l.split(":")[0] for l in hints.splitlines()] == ["- chicken breast", "- eggs", "- frozen peas", "- rice"]
