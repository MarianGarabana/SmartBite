import json
from pathlib import Path

import pytest

from smartbite_engine.contracts import CONTRACTS, parse_reply, validate_output
from smartbite_engine.form import MealForm

ROOT = Path(__file__).resolve().parents[1]
MACROS = {"kcal": 450, "protein_g": 45, "carbs_g": 40, "fat_g": 12}


def idea(n="1", **extra):
    return {"idea_id": n, "name": "Greek chicken bowl", "one_line": "Chicken, rice, cucumber and a yogurt sauce.",
            "main_ingredients": ["chicken breast", "rice", "cucumber"], "rough_macros": MACROS,
            "image_prompt": "overhead photo of a chicken rice bowl", **extra}


def recipe(**extra):
    return {"idea_id": "1", "title": "Greek chicken bowl", "servings": 4, "prep_time_min": 40,
            "ingredients": [{"name": "chicken breast", "grams_per_serving": 170, "units_per_serving": 0,
                             "storage": "fresh", "pantry": False, "dry": False},
                            {"name": "rice", "grams_per_serving": 70, "units_per_serving": 0,
                             "storage": "keeps", "pantry": False, "dry": True, "note": "dry weight"}],
            "steps": ["Cook the rice.", "Grill the chicken."], **extra}


def test_every_contract_file_is_json_with_defs():
    files = sorted(CONTRACTS.glob("*.schema.json"))
    assert {f.name for f in files} >= {"common.schema.json", "idea.schema.json", "revision.schema.json",
                                       "recipe.schema.json", "meal.schema.json", "kitchen-profile.schema.json",
                                       "evaluate.schema.json"}
    for f in files:
        assert "$defs" in json.loads(f.read_text(encoding="utf-8")), f.name


def _field_names(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "properties":
                yield from value
            yield from _field_names(value)
    elif isinstance(node, list):
        for value in node:
            yield from _field_names(value)


def test_no_store_or_personal_fields_in_contracts():
    fields = {k for f in CONTRACTS.glob("*.json") for k in _field_names(json.loads(f.read_text(encoding="utf-8")))}
    assert not fields & {"search_term", "counts", "live_session", "auto_matched", "needs_match", "pack_label"}


def test_ideas_reply_passes():
    assert validate_output({"ideas": [idea(str(n)) for n in range(1, 5)]}, "idea.schema.json") == []


def test_ideas_reply_needs_four_ideas():
    errors = validate_output({"ideas": [idea(str(n)) for n in range(1, 4)]}, "idea.schema.json")
    assert any("at least 4" in e for e in errors)


def test_idea_name_over_60_characters_fails():
    errors = validate_output({"ideas": [idea(name="x" * 61)] + [idea(str(n)) for n in range(2, 5)]}, "idea.schema.json")
    assert any("at most 60 characters" in e for e in errors)


def test_idea_rough_macros_resolve_across_files():
    bad = idea(rough_macros={"kcal": 450, "protein_g": 45})
    errors = validate_output({"ideas": [bad] + [idea(str(n)) for n in range(2, 5)]}, "idea.schema.json")
    assert any("missing required field carbs_g" in e for e in errors)


def test_idea_extra_field_is_rejected():
    errors = validate_output({"ideas": [idea(price=3)] + [idea(str(n)) for n in range(2, 5)]}, "idea.schema.json")
    assert any("unexpected field price" in e for e in errors)


def test_revision_reply_passes_and_keeps_changes_field_optional():
    assert validate_output({"idea": idea()}, "revision.schema.json") == []
    assert validate_output({"idea": idea(changes="no rice, more cucumber")}, "revision.schema.json") == []


def test_recipe_reply_passes():
    assert validate_output(recipe(), "recipe.schema.json") == []


def test_recipe_rejects_zero_grams_bad_storage_and_store_fields():
    r = recipe()
    r["ingredients"][0].update(grams_per_serving=0, storage="fridge", search_term="pollo")
    errors = validate_output(r, "recipe.schema.json")
    assert any("grams_per_serving: must be > 0" in e for e in errors)
    assert any("storage: must be one of" in e for e in errors)
    assert any("unexpected field search_term" in e for e in errors)


def test_recipe_takes_an_optional_short_note_and_no_other_extra_field():
    assert validate_output(recipe(note="Chickpeas from a jar, drained."), "recipe.schema.json") == []
    assert any("at most 200 characters" in e for e in validate_output(recipe(note="x" * 201), "recipe.schema.json"))
    assert any("unexpected field tips" in e for e in validate_output(recipe(tips="none"), "recipe.schema.json"))


def test_recipe_servings_limited_to_1_to_8():
    assert any("must be <= 8" in e for e in validate_output(recipe(servings=9), "recipe.schema.json"))


def test_parse_reply_accepts_a_json_fence():
    data, errors = parse_reply('```json\n{"a": 1}\n```')
    assert (data, errors) == ({"a": 1}, [])


def test_parse_reply_rejects_text_after_json():
    data, errors = parse_reply('{"a": 1}\nHere are your ideas!')
    assert data is None and "extra text" in errors[0]


def test_parse_reply_rejects_broken_json():
    data, errors = parse_reply('{"a": ')
    assert data is None and "not valid JSON" in errors[0]


FORM = {"craving": "chicken bowl", "servings": 4, "budget_total_eur": 20, "kcal_target": 450,
        "protein_g_target": 45, "keep_leftovers_low": True, "gear": ["oven"], "exclude": []}


def test_meal_form_contract_matches_engine_form():
    assert validate_output(FORM, "common.schema.json", "MealForm") == []
    MealForm(**FORM)
    assert any("must be one of" in e for e in validate_output({**FORM, "gear": ["grill"]}, "common.schema.json", "MealForm"))


def meal():
    line = {"ingredient": "chicken breast", "grams_needed": 680, "storage": "fresh", "optional": False,
            "has_price": True, "sold_by": "pack", "product_name": "Chicken breast 500 g", "product_url": "https://x/1",
            "packs_to_buy": 2, "grams_bought": 1000, "grams_left": 320, "leftover_pct": 32.0,
            "leftover_status": "use_in_2_days", "cost_bought_eur": 7.3, "cost_used_eur": 4.96,
            "price_date": "2026-10-19", "price_source": "user"}
    unpriced = {"ingredient": "rice", "grams_needed": 280, "storage": "keeps", "optional": False, "has_price": False,
                "product_name": None, "product_url": None, "sold_by": None, "cost_bought_eur": None, "cost_used_eur": None}
    pack = {"lines": [line, unpriced], "cart_total_eur": 7.3, "cost_per_serving_eur": 1.83, "used_total_eur": 4.96,
            "waste_grams": 320, "waste_eur": 2.34, "within_budget": True, "over_budget_eur": None,
            "optional_total_eur": 0, "budget_check_complete": False, "unpriced": ["rice"], "price_note": None,
            "change_requests": [{"from_agent": "pack", "ingredient": "chicken breast", "reason": "high_leftover",
                                 "hint": "use the whole pack"}]}
    macros = {"per_serving": MACROS, "total": {k: v * 4 for k, v in MACROS.items()}, "misses": [],
              "missing_nutrition": [], "lines": [{"name": "chicken breast", "grams": 680, "source": "ciqual",
                                                  "source_id": "36005", "amount": MACROS}]}
    return {"date": "2026-10-19", "run": "test", "form": FORM, "picked_idea": idea(), "recipe": recipe(),
            "evaluation": {"attempt": 0, "status": "issues", "pack": pack, "macros": macros}}


def test_meal_result_passes():
    assert validate_output(meal(), "meal.schema.json") == []


def test_meal_result_rejects_store_fields():
    m = meal()
    m["counts"] = {"catalog": 1}
    m["evaluation"]["live_session"] = {"pages": 0}
    errors = validate_output(m, "meal.schema.json")
    assert any("unexpected field counts" in e for e in errors)
    assert any("unexpected field live_session" in e for e in errors)


def test_meal_result_needs_pack_and_macros():
    m = meal()
    del m["evaluation"]["macros"]
    assert any("missing required field macros" in e for e in validate_output(m, "meal.schema.json"))


def test_demo_meal_fields_are_optional_and_typed():
    demo = {**meal(), "slug": "greek-chicken-bowl", "demo": True, "fixture": False,
            "photo": "/demo/images/greek-chicken-bowl.jpg", "photo_ai_generated": True}
    assert validate_output(demo, "meal.schema.json") == []
    errors = validate_output({**demo, "demo": "yes", "photo": 3, "photo_ai_generated": 1, "fixture": None},
                             "meal.schema.json")
    for field in ("demo", "photo", "photo_ai_generated", "fixture"):
        assert any(e.startswith(f"{field}: must be") for e in errors), field


def evaluate_request(**extra):
    profile = json.loads((ROOT / "prompts" / "kitchen-profile.default.json").read_text(encoding="utf-8"))
    return {"form": FORM, "profile": profile, "picked_idea": idea(), "recipe": recipe(), **extra}


def test_evaluate_request_passes_with_and_without_profile():
    assert validate_output(evaluate_request(), "evaluate.schema.json", "Input") == []
    request = evaluate_request()
    del request["profile"]
    assert validate_output(request, "evaluate.schema.json", "Input") == []


def test_evaluate_request_checks_each_part_with_its_own_contract():
    request = evaluate_request(extra=1)
    del request["recipe"]
    request["picked_idea"] = idea(name="x" * 61)
    request["form"] = {**FORM, "servings": 9}
    request["profile"] = {"id": "p"}
    errors = validate_output(request, "evaluate.schema.json", "Input")
    assert any("missing required field recipe" in e for e in errors)
    assert any("unexpected field extra" in e for e in errors)
    assert any(e.startswith("picked_idea.name") for e in errors)
    assert any(e.startswith("form.servings") for e in errors)
    assert any(e.startswith("profile: missing required field") for e in errors)


def test_evaluate_response_is_a_meal_result():
    assert validate_output(meal(), "evaluate.schema.json") == []
    m = meal()
    m["counts"] = {}
    assert any("unexpected field counts" in e for e in validate_output(m, "evaluate.schema.json"))


def test_default_kitchen_profile_matches_contract():
    profile = json.loads((ROOT / "prompts" / "kitchen-profile.default.json").read_text(encoding="utf-8"))
    assert validate_output(profile, "kitchen-profile.schema.json") == []


@pytest.mark.parametrize("bad", [{"type": "color"}, {"label": "x" * 61}])
def test_kitchen_profile_field_rules(bad):
    profile = {"id": "p", "version": 1, "name": "Mine", "sections": [{"id": "s", "label": "S", "fields": [
        {"id": "f", "label": "F", "type": "text", "value": "No blender.", **bad}]}]}
    assert validate_output(profile, "kitchen-profile.schema.json")
