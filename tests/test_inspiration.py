import itertools

from smartbite_engine.inspiration import (COUNT, DISHES, FIELDS, foods, has_food, load_dishes, numbers, pick_dishes,
                                          seed_number, shuffled)
from smartbite_engine.names import canonical, foods as food_keys, singular, stems

DISH_LIST = load_dishes()


def test_dish_file_has_83_web_dishes_with_all_fields():
    assert len(DISH_LIST) == 83
    for d in DISH_LIST:
        assert set(d) == {"name", "cuisine", "style", "core", "method", "source"}, d["name"]
        assert d["source"].startswith("https://"), d["name"]
        assert len(d["core"]) >= 2, d["name"]


def test_dish_foods_are_english_keys():
    keys = set(food_keys())
    bad = sorted({f for d in DISH_LIST for f in d["core"] if f not in keys})
    assert bad == [], bad


def test_dish_names_are_unique_and_file_has_no_personal_notes():
    assert len({d["name"] for d in DISH_LIST}) == len(DISH_LIST)
    text = DISHES.read_text(encoding="utf-8").lower()
    for word in ("recipes.md", "catalog", "own recipes"):
        assert word not in text


def test_stem_drops_plurals_in_both_languages():
    assert [singular(w) for w in ("huevos", "eggs", "champinones", "limones", "coles", "tomatoes", "noodles", "arroz")] == \
        ["huevo", "egg", "champinon", "limon", "col", "tomato", "noodle", "arroz"]
    assert stems("Pechuga de pollo con Champiñones") == {"pechuga", "pollo", "champinon"}


def test_pick_returns_12_dishes_with_the_prompt_fields():
    picked = pick_dishes("anything", seed="r1")
    assert len(picked) == COUNT
    assert all(set(d) == set(FIELDS) for d in picked)


def test_craving_matches_come_first_in_spanish():
    picked = pick_dishes("algo con salmón", seed="r1")
    salmon = [d for d in DISH_LIST if "salmon" in d["core"]]
    assert {d["name"] for d in picked[:len(salmon)]} == {d["name"] for d in salmon}


def test_english_craving_matches_through_english_names():
    picked = pick_dishes("lentil soup", seed="r1")
    assert "dried lentils" in picked[0]["core"]
    assert any("dried lentils" in d["core"] for d in picked[:4])


def test_spanish_craving_matches_through_the_aliases():
    picked = pick_dishes("sopa de lentejas", seed="r1")
    assert "dried lentils" in picked[0]["core"]


def test_no_dish_with_an_excluded_food_spanish_or_english():
    for exclude in (["huevos"], ["eggs"], ["pollo", "cebolla"], ["chicken", "onion"]):
        picked = pick_dishes("chicken with eggs and onion", exclude, seed="r2", count=80)
        assert picked
        assert not any(has_food(d, exclude) for d in DISH_LIST if d["name"] in {p["name"] for p in picked})
    names = {d["name"] for d in pick_dishes("tortilla", ["eggs"], seed="r2", count=80)}
    assert "Tortilla de patatas" not in names and "Shakshuka" not in names


def test_exclusion_needs_every_word_of_the_item():
    pepper_dish = next(d for d in DISH_LIST if d["name"] == "Pollo al chilindron")
    assert has_food(pepper_dish, ["pimiento rojo"]) and has_food(pepper_dish, ["pepper"])
    assert not has_food(pepper_dish, ["rojo picante"])


def test_same_seed_same_pick_other_seed_other_order():
    a = pick_dishes("bowl", seed="request-1")
    assert a == pick_dishes("bowl", seed="request-1")
    assert [d["name"] for d in pick_dishes("zzz", seed="request-1")] != [d["name"] for d in pick_dishes("zzz", seed="request-2")]


def test_pick_works_on_a_given_list():
    dishes = [{"name": f"Dish {i}", "cuisine": "Test", "style": "bowl", "core": ["rice", "tofu"],
               "method": "Cook."} for i in range(3)]
    assert len(pick_dishes("tofu", seed=1, dishes=dishes)) == 3
    assert pick_dishes("tofu", ["tofu"], seed=1, dishes=dishes) == []
    assert pick_dishes("tofu", ["arroz"], seed=1, dishes=dishes) == []


def test_dish_food_names_carry_the_spanish_aliases():
    dish = {"name": "x", "cuisine": "x", "style": "x", "core": ["eggs", "Champiñón"], "method": "x"}
    names = foods(dish)
    assert names[0][0] == "eggs" and "huevos" in names[0]
    assert names[1][0] == canonical("champiñón") == "mushrooms" and "champinon" in names[1]


def test_shared_shuffle_gives_the_same_numbers_as_the_web_app():
    # Same values are pinned in web/test/inspiration.test.mjs: both sides must give the same pick for a seed
    assert seed_number("r1") == 206831020 and seed_number("señal") == 1282202828
    assert list(itertools.islice(numbers("r1"), 4)) == [1558469944, 3941382763, 2834726580, 1134923905]
    assert shuffled(range(10), "r1") == [6, 2, 5, 0, 8, 7, 3, 9, 1, 4]
    assert shuffled(range(10), 42) == shuffled(range(10), "42") == [3, 8, 2, 6, 4, 7, 0, 5, 9, 1]


def test_shuffle_keeps_every_item_and_leaves_the_input_alone():
    items = list(range(80))
    out = shuffled(items, "request-1")
    assert sorted(out) == items and out != items and items == list(range(80))
    assert shuffled([], "x") == [] and shuffled(["a"], "x") == ["a"]
