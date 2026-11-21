import json
from pathlib import Path

import pytest

from smartbite_engine.names import (ALIASES, aliases, aliases_of, all_foods, ambiguous, canonical, foods, match, pairs,
                                    plain, singular, stems, word_rules)

ROOT = Path(__file__).resolve().parents[1]
OPEN = ROOT / "data" / "open"


def load(path):
    return json.loads((OPEN / path).read_text(encoding="utf-8"))


NUTRITION = load("nutrition/per-100g.json")["foods"]
PACKS = load("packs/packs.json")["foods"]
DROPPED = json.loads((ROOT / "data" / "build" / "nutrition-map.json").read_text(encoding="utf-8"))["dropped"]
MORE = json.loads(ALIASES.read_text(encoding="utf-8"))["more_foods"]


def test_plain_strips_accents_case_and_spaces():
    assert plain("  Plátano ") == "platano"
    assert plain("Champiñón  laminado") == "champinon laminado"
    assert plain(None) == ""


def test_singular_and_stems():
    assert [singular(w) for w in ("huevos", "eggs", "limones", "tomatoes", "arroz", "kiwi")] == \
        ["huevo", "egg", "limon", "tomato", "arroz", "kiwi"]
    assert stems("Pechuga de pollo con Champiñones") == {"pechuga", "pollo", "champinon"}


@pytest.mark.parametrize("name,key", [
    ("chicken breast", "chicken breast"), ("Chicken Breasts", "chicken breast"),
    ("pechuga de pollo", "chicken breast"), ("Pechugas de Pollo", "chicken breast"),
    ("huevos", "eggs"), ("egg", "eggs"), ("Champiñón", "mushrooms"), ("champiñones", "mushrooms"),
    ("plátano", "banana"), ("fresón", "strawberries"), ("fresa", "strawberries"), ("jengibre molido", "ground ginger"),
    ("tomates", "tomato"), ("limones", "lemon"), ("yogur griego 0%", "greek yogurt 0%"),
    ("Greek yogurt 0 %", "greek yogurt 0%"), ("brócoli congelado", "frozen broccoli"), ("brocoli", "broccoli"),
    ("salmón congelado", "frozen salmon"), ("feta cheese", "feta"), ("coles de bruselas", "brussels sprouts"),
])
def test_canonical_resolves_spanish_english_accents_and_plurals(name, key):
    assert canonical(name) == key


# "pollo" was here until 2026-11-21: the owner decided plain chicken counts as chicken meat through a word rule
# (test_plain_chicken_counts_as_chicken_meat below); "pechuga" and "muslo" alone stay unknown (chicken or turkey)
@pytest.mark.parametrize("name", ["dragon fruit", "", "pechuga", "muslo", "chickpeas", "canned tuna", "lentils"])
def test_canonical_is_none_for_unknown_or_unclear_names(name):
    # "chickpeas" could be canned or dried (very different macros): no guess, the caller sees an unknown food
    assert canonical(name) is None


def test_no_name_points_to_two_foods():
    assert ambiguous() == []


def test_every_key_is_english_plain_and_maps_to_itself():
    keys = all_foods()
    assert len(keys) == len(set(keys))
    for key in keys:
        assert key == plain(key) and key.isascii(), key
        assert canonical(key) == key, key


# The one exception (Marian, 2026-11-20): peas in Spanish shops are sold frozen and have about the same nutrition, so
# plain pea names use the frozen peas record (they were unmatched before and left out of every total)
FRESH_TO_FROZEN_OK = {"guisantes": "frozen peas", "peas": "frozen peas", "green peas": "frozen peas"}


def test_aliases_point_to_keys_and_agree_on_frozen():
    keys = set(all_foods())
    frozen = lambda name: "frozen" in name or "congelad" in name
    for alias, key in pairs():
        assert key in keys, alias
        assert alias not in keys, alias
        if FRESH_TO_FROZEN_OK.get(alias) == key:
            continue
        assert frozen(alias) == frozen(key), alias  # a fresh name never resolves to a frozen record
    assert aliases()["pechuga de pollo"] == "chicken breast"
    assert aliases_of("strawberries") == ["fresas", "freson"]


def test_every_alias_resolves_to_its_key():
    assert all(canonical(alias) == key for alias, key in pairs())
    assert {"pechuga de pollo", "garbanzos cocidos", "atun claro al natural lata", "yogur griego 0%"} <= set(aliases())


def test_aliases_file_lists_every_food_of_the_data():
    assert set(all_foods()) == set(NUTRITION) | set(PACKS)
    data = json.loads(ALIASES.read_text(encoding="utf-8"))
    assert data["foods"] == foods() and data["more_foods"] == sorted(MORE)
    # The prompt's food list is the foods with a pack size; the more foods are for names and nutrition only
    assert set(foods()) == set(PACKS) and not set(foods()) & set(MORE)


def test_every_food_has_nutrition_and_pack_entry():
    no_pack = sorted(set(NUTRITION) - set(PACKS))
    no_nutrition = sorted(set(PACKS) - set(NUTRITION))
    assert no_pack == sorted(MORE), f"in per-100g.json, not in packs.json: {sorted(set(no_pack) - set(MORE))}"
    # Nothing is left out since 2026-11-21: frozen salmon, the last one, uses the raw salmon record as a stated
    # exception (test_build_nutrition.py). Whey has a USDA record since 2026-10-19.
    assert no_nutrition == sorted(DROPPED) == [], no_nutrition


def test_photo_names_cover_every_food():
    assert set(load("english-names.json")["names"]) == set(all_foods())


@pytest.mark.parametrize("name", ["pork chops", "Cerdo", "pork steak", "lomo de cerdo adobado", "chuletas de cerdo"])
def test_any_other_pork_counts_as_pork_loin(name):
    # Decided 2026-11-21: any pork counts as pork; a pork food with its own record (below) wins over pork loin
    assert match(name) == ("pork loin", True)


@pytest.mark.parametrize("name,key", [
    ("ground pork", "ground pork"), ("Pork mince", "ground pork"), ("carne picada de cerdo", "ground pork"),
    ("carne molida de cerdo", "ground pork"), ("costillas de cerdo adobadas", "pork ribs"),
    ("pulled pork", "pork shoulder"), ("chorizo de cerdo", "chorizo"), ("pork belly slices", "pork belly"),
])
def test_pork_foods_with_their_own_record_win_over_pork_loin(name, key):
    # Ground pork has about 60% more kcal than pork loin (233 vs 146 per 100 g): counting it as loin was too low
    assert canonical(name) == key
    assert NUTRITION["ground pork"]["kcal"] > 1.5 * NUTRITION["pork loin"]["kcal"]


def test_ground_pork_counts_in_the_meal_macros():
    from smartbite_engine.meal import evaluate
    recipe = {"title": "Pork fried quinoa", "servings": 1, "steps": ["Cook."],
              "ingredients": [{"name": "ground pork", "grams_per_serving": 100, "units_per_serving": 0,
                               "storage": "fresh", "pantry": False, "dry": False}]}
    form = {"craving": "pork", "kcal_target": 450, "protein_g_target": 45, "servings": 1, "budget_total_eur": 5.5}
    macros = evaluate(form, {"idea_id": "1", "name": "Pork", "main_ingredients": []}, recipe)["evaluation"]["macros"]
    assert macros["unresolved"] == [] and macros["lines"][0]["food"] == "ground pork"
    assert macros["per_serving"]["kcal"] == round(NUTRITION["ground pork"]["kcal"], 2)  # 100 g


# Owner's real meals (2026-11-21): names that were unknown and counted 0 kcal
@pytest.mark.parametrize("name,key", [
    ("honey", "honey"), ("cilantro", "cilantro"), ("peach", "peach"), ("almond flour", "almond flour"),
    ("chickpea flour", "chickpea flour"), ("ground pork", "ground pork"), ("lentil rice cakes", "rice cakes"),
])
def test_owner_unknown_foods_now_count(name, key):
    assert canonical(name) == key and key in NUTRITION


@pytest.mark.parametrize("name,key", [
    ("miel", "honey"), ("melocotón", "peach"), ("Tortillas de maíz", "corn tortillas"), ("frijoles refritos", "refried beans"),
    ("nopales", "nopales"), ("jamón serrano", "serrano ham"), ("aceite de oliva", "extra virgin olive oil"),
    ("olive oil", "extra virgin olive oil"), ("espaguetis", "macaroni"), ("avena", "rolled oats"), ("oats", "rolled oats"),
    ("almendras", "almonds"), ("leche entera", "whole milk"), ("mantequilla", "butter"), ("queso manchego", "manchego cheese"),
    ("gambas", "shrimp"), ("bacon", "bacon"), ("chorizo", "chorizo"), ("chorizo mexicano", "mexican chorizo"),
    ("pan de molde", "white bread"), ("harina", "wheat flour"), ("tortitas de arroz", "rice cakes"),
    ("bebida de avena", "oat drink"), ("almond milk", "almond drink"), ("sardinas en aceite", "canned sardines"),
])
def test_common_spanish_english_and_mexican_names(name, key):
    assert match(name) == (key, False)


@pytest.mark.parametrize("name,key", [
    ("leche", "semi-skimmed milk"), ("milk", "semi-skimmed milk"), ("fat free milk", "skimmed milk"),
    ("bread", "white bread"), ("pan", "white bread"), ("whole wheat bread", "wholemeal sandwich bread"),
    ("aceite", "sunflower oil"), ("cooking oil", "sunflower oil"), ("aceite de oliva suave", "extra virgin olive oil"),
    ("yogurt", "plain yogurt"), ("fat free greek yogurt", "greek yogurt 0%"), ("protein powder", "vanilla whey protein"),
    ("proteina en polvo", "vanilla whey protein"), ("chocolate whey", "vanilla whey protein"), ("beef", "beef steak"),
    ("carne de res", "beef steak"), ("huevos camperos", "eggs"), ("pechugas de pollo fileteadas", "chicken breast"),
    ("frozen shrimp tails", "frozen shrimp"), ("unsalted butter", "butter"), ("jamón ibérico", "serrano ham"),
])
def test_word_rules_count_a_name_as_the_closest_food(name, key):
    assert match(name) == (key, True)


@pytest.mark.parametrize("name", [
    # processed forms with other macros: never counted as the food they name
    "pork fat", "grasa de cerdo", "manteca de cerdo", "pork rinds", "beef broth", "caldo de pollo casero", "beef jerky",
    "hamburguesa de ternera", "pan rallado", "garlic bread", "peanut butter powder", "milk chocolate", "chocolate milk",
    "strawberry yogurt", "frozen yogurt", "butter beans",
    # the name is about another food: "en aceite" is how it is packed, not the food
    "atún en escabeche", "sardinas", "bacalao salado",
    # canned and dried differ a lot, so a plain legume name stays unknown (like chickpeas)
    "frijoles negros", "black beans", "garbanzos",
])
def test_word_rules_leave_other_foods_unknown(name):
    assert match(name) == (None, False)


def test_word_rules_keep_fresh_and_frozen_apart():
    assert canonical("gambas congeladas peladas") == "frozen shrimp" and canonical("gambas peladas") == "shrimp"
    assert canonical("merluza congelada en filetes") == "frozen hake" and canonical("filetes de merluza") == "hake"
    keys = set(all_foods())
    for rule in word_rules():
        assert rule["food"] is None or rule["food"] in keys, rule
        # a rule whose words do not say frozen never gives a frozen food
        if rule["food"] and "frozen" in rule["food"]:
            assert rule["words"] & {"frozen", "congelado", "congelada"}, rule


def test_word_rules_never_reach_the_prompt_food_list():
    # The prompt lists foods() only (decided 2026-11-03: no food-list change without an eval run)
    assert len(foods()) == 139 and "honey" not in foods() and "honey" in all_foods()


def test_more_aliases_resolve_but_leave_the_dish_picks_alone():
    # Names added 2026-11-21 sit in "more_aliases": the engine knows them, the Idea prompt's dish picks (which match
    # through aliases_of) stay the same until an eval run
    assert canonical("pasta") == "macaroni" and canonical("olive oil") == "extra virgin olive oil"
    assert "pasta" not in aliases_of("macaroni") and "olive oil" not in aliases_of("extra virgin olive oil")
    data = json.loads(ALIASES.read_text(encoding="utf-8"))
    assert not set(data["aliases"]) & set(data["more_aliases"])


@pytest.mark.parametrize("name", ["pollo", "Chicken", "pollo asado", "chicken pieces", "carne de pollo en tiras"])
def test_plain_chicken_counts_as_chicken_meat(name):
    # Decided 2026-11-21 (owner): plain chicken counts as Ciqual "chicken meat, raw", marked counted_as in the meal
    key, by_rule = match(name)
    assert key == "chicken meat" and NUTRITION[key]["source_id"] == "36003"
    assert by_rule is True


# "frozen chicken" stayed unknown here until the owner's 2026-11-21 answer: plain frozen raw chicken now counts (below)
@pytest.mark.parametrize("name,key", [("chicken skin", None), ("caldo de pollo casero", None), ("chicken nuggets", None),
                                      ("pechugas de pollo", "chicken breast"),
                                      ("chicken sausage", "turkey sausages"), ("pollo molido", "ground chicken")])
def test_chicken_cuts_and_products_keep_their_own_food(name, key):
    assert canonical(name) == key


@pytest.mark.parametrize("name,key", [("salmón congelado", "frozen salmon"), ("frozen salmon fillets", "frozen salmon"),
                                      ("frozen breaded salmon", None), ("salmon empanado congelado", None),
                                      ("frozen salmon nuggets", None)])
def test_frozen_salmon_is_plain_fillets_only(name, key):
    assert canonical(name) == key


@pytest.mark.parametrize("name,key,by_rule", [
    # Decided 2026-11-21 (owner): plain frozen raw chicken counts, on the matching raw record (stated exception)
    ("frozen chicken breast", "frozen chicken breast", False), ("pechuga de pollo congelada", "frozen chicken breast", False),
    ("pechugas de pollo congeladas", "frozen chicken breast", False), ("frozen boneless chicken breast", "frozen chicken breast", True),
    ("frozen chicken thighs", "frozen chicken thigh", False), ("contramuslo de pollo congelado", "frozen chicken thigh", False),
    ("contramuslos congelados", "frozen chicken thigh", True), ("frozen diced chicken", "frozen chicken", False),
    # In Spain muslo is the drumstick and contramuslo the thigh: frozen muslo follows the fresh name (owner, 2026-11-21)
    ("muslo de pollo congelado", "frozen chicken drumsticks", False),
    ("muslos de pollo congelados", "frozen chicken drumsticks", False),
    ("frozen chicken drumsticks", "frozen chicken drumsticks", False), ("frozen drumsticks", "frozen chicken drumsticks", False),
    ("frozen skinless drumsticks", "frozen chicken drumsticks", True),
    ("frozen chicken", "frozen chicken", False), ("pollo congelado", "frozen chicken", False),
    ("pollo troceado congelado", "frozen chicken", False),
])
def test_plain_frozen_chicken_counts_on_the_raw_records(name, key, by_rule):
    assert match(name) == (key, by_rule)


@pytest.mark.parametrize("name", [
    "frozen breaded chicken breast", "pechugas de pollo empanadas congeladas", "pollo rebozado congelado",
    "frozen chicken nuggets", "frozen chicken fingers", "frozen chicken burgers", "frozen chicken wings",
    "alitas de pollo congeladas en salsa barbacoa", "frozen chicken in sauce", "frozen cooked chicken",
    "pollo asado congelado", "pollo congelado precocinado", "frozen grilled chicken strips",
    "muslos de pollo empanados congelados", "muslos de pollo congelados en salsa", "muslos de pollo asados congelados",
    "frozen chicken drumsticks cooked", "frozen breaded drumsticks",
])
def test_frozen_chicken_products_never_count_as_raw_chicken(name):
    assert match(name) == (None, False)


def test_frozen_and_fresh_muslo_are_the_same_cut():
    # muslo = drumstick, fresh or frozen; both on Ciqual 36022
    assert canonical("muslos de pollo") == "chicken drumsticks"
    assert canonical("muslos de pollo congelados") == "frozen chicken drumsticks"
    assert NUTRITION["frozen chicken drumsticks"]["source_id"] == NUTRITION["chicken drumsticks"]["source_id"] == "36022"
