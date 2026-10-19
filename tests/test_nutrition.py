import json

import pytest

from smartbite_engine.calc import Nutrition
from smartbite_engine.nutrition import (cache_loader, ingredient_macros, load_table, meal_macros, parse_off, plain,
                                        resolve)
from smartbite_engine.names import canonical


def rec(kcal, p, c, f, state="raw", source="ciqual", source_id="1", name="Food"):
    return {"kcal": kcal, "protein_g": p, "carbs_g": c, "fat_g": f, "source": source, "source_id": source_id,
            "source_name": name, "state": state, "match_note": "test"}


# English keys like the real table; the tests call most foods by their Spanish names, which resolve through
# data/open/aliases.json. "aceite" is not a known food: it is found by its name as written.
TABLE = {
    "chicken breast": rec(110, 23.4, 0, 1.5, source_id="36017", name="Chicken, breast, without skin, raw"),
    "rice": rec(350, 7.0, 77.5, 0.8, state="dry"),
    "eggs": rec(140, 12.8, 0.1, 9.8),
    "strawberries": rec(35, 0.6, 6.0, 0.0),
    "broccoli": rec(32, 2.9, 2.2, 0.4),
    "frozen broccoli": rec(26, 2.8, 1.5, 0.4, state="frozen"),
    "banana": rec(88, 1.1, 19.7, 0.0),
    "aceite": {**rec(899, 0.3, 0, 99.9), "missing": ["protein_g"]},
}


def off_text(kcal=380, protein=80, carbs=6, fat=5, status=1):
    if status != 1:
        return json.dumps({"status": 0, "status_verbose": "product not found"})
    return json.dumps({"status": 1, "product": {"product_name": "Whey test", "nutriments": {
        "energy-kcal_100g": kcal, "proteins_100g": protein, "carbohydrates_100g": carbs, "fat_100g": fat}}})


def test_plain_strips_accents_case_and_spaces():
    assert plain("  Plátano ") == "platano"
    assert plain("Champiñón  laminado") == "champinon laminado"


def test_resolve_from_table_with_accented_name():
    found = resolve("Plátano", table=TABLE)
    assert found.per_100g == Nutrition(88, 1.1, 19.7, 0.0)
    assert (found.source, found.state) == ("ciqual", "raw")


def test_spanish_and_english_names_give_the_same_record():
    for es, en in (("pechuga de pollo", "chicken breast"), ("Pechugas de Pollo", "chicken breast"),
                   ("huevos", "egg"), ("brócoli congelado", "frozen broccoli")):
        assert resolve(es, table=TABLE).per_100g == resolve(en, table=TABLE).per_100g, es


def test_resolve_keeps_source_id_name_and_missing():
    found = resolve("aceite", table=TABLE)
    assert found.missing == ("protein_g",)
    chicken = resolve("pechuga de pollo", table=TABLE)
    assert (chicken.source_id, chicken.source_name) == ("36017", "Chicken, breast, without skin, raw")


def test_unknown_food_raises():
    with pytest.raises(LookupError):
        resolve("dragon fruit", table=TABLE)


def test_barcode_uses_open_food_facts_first():
    load = lambda kind, key: off_text()
    found = resolve("arroz", table=TABLE, barcode="123", load=load)
    assert found.source == "open_food_facts"
    assert found.source_id == "123"
    assert found.per_100g == Nutrition(380, 80, 6, 5)


def test_barcode_not_on_open_food_facts_falls_back_to_table():
    found = resolve("arroz", table=TABLE, barcode="999", load=lambda kind, key: off_text(status=0))
    assert found.source == "ciqual"


def test_barcode_without_loader_uses_table():
    assert resolve("arroz", table=TABLE, barcode="123").source == "ciqual"


def test_parse_off_lists_missing_fields_as_zero():
    text = json.dumps({"status": 1, "product": {"product_name": "x", "nutriments": {"energy-kcal_100g": 50}}})
    name, nutrition, missing = parse_off(text)
    assert nutrition == Nutrition(50, 0, 0, 0)
    assert missing == ("protein_g", "carbs_g", "fat_g")


def test_frozen_ingredient_uses_frozen_record():
    assert resolve("brocoli congelado", table=TABLE).state == "frozen"


def test_frozen_product_never_takes_fresh_vegetable_record():
    with pytest.raises(LookupError):
        resolve("brocoli", table=TABLE, product_name="Brocoli congelado 1 kg")


def test_fresh_ingredient_never_takes_frozen_record():
    table = {"guisantes": rec(78, 5.9, 9.5, 0.4, state="frozen")}
    with pytest.raises(LookupError):
        resolve("guisantes", table=table)


def test_plain_frozen_fruit_may_use_fresh_record():
    assert resolve("fresas", table=TABLE, product_name="Fresas congeladas 500 g").state == "raw"


def test_plain_frozen_fruit_in_english_may_use_fresh_record():
    assert resolve("strawberries", table=TABLE, product_name="Frozen strawberries 500 g").state == "raw"
    with pytest.raises(LookupError):
        resolve("broccoli", table=TABLE, product_name="Frozen broccoli 1 kg")


def test_frozen_fruit_with_sugar_does_not_use_fresh_record():
    with pytest.raises(LookupError):
        resolve("fresas", table=TABLE, product_name="Fresas congeladas en almibar")


def test_ingredient_macros_scales_grams():
    line = ingredient_macros("pechuga de pollo", 200, table=TABLE)
    assert line.amount == pytest.approx(Nutrition(220, 46.8, 0, 3.0))
    assert line.source_id == "36017"


def test_meal_macros_total_and_per_serving():
    meal = meal_macros([("pechuga de pollo", 400), ("arroz", 160)], servings=2, table=TABLE)
    assert meal.total == pytest.approx(Nutrition(440 + 560, 93.6 + 11.2, 124.0, 6.0 + 1.28))
    assert meal.per_serving == pytest.approx(Nutrition(500, 52.4, 62.0, 3.64))
    assert [line.grams for line in meal.lines] == [400, 160]


def test_meal_macros_eggs_in_units_by_size():
    # 3 L eggs = 180 g edible, 2 eggs default size M = 102 g
    meal = meal_macros([{"ingredient": "huevos", "units": 3, "egg_size": "L"},
                        {"ingredient": "huevos", "units": 2}], servings=1, table=TABLE)
    assert [line.grams for line in meal.lines] == [180, 102]
    assert meal.total.kcal == pytest.approx(140 * 2.82)


def test_meal_macros_dict_item_with_barcode():
    meal = meal_macros([{"ingredient": "proteina", "grams": 30, "barcode": "123"}], servings=1, table=TABLE,
                       load=lambda kind, key: off_text())
    assert meal.lines[0].source == "open_food_facts"
    assert meal.total.protein_g == pytest.approx(24)


def test_cache_loader_reads_cache_then_fetches_and_saves(tmp_path):
    (tmp_path / "off_1.json").write_text(off_text(), encoding="utf-8")
    calls = []

    def fetch(kind, key):
        calls.append(key)
        return off_text(kcal=100)

    load = cache_loader(tmp_path, fetch=fetch)
    assert parse_off(load("off", "1"))[1].kcal == 380
    assert parse_off(load("off", "2"))[1].kcal == 100
    assert calls == ["2"]
    assert (tmp_path / "off_2.json").exists()


def test_cache_loader_without_fetch_raises(tmp_path):
    with pytest.raises(LookupError):
        cache_loader(tmp_path)("off", "404")


def test_open_table_loads_every_food_with_source_fields():
    table = load_table()
    assert len(table) > 100
    for name, record in table.items():
        assert record["source"] in {"ciqual", "usda"}, name
        assert record["source_id"] and record["source_name"] and record["match_note"], name
        assert record["state"] in {"raw", "cooked", "dry", "canned", "frozen"}, name
        assert all(record[f] >= 0 for f in ("kcal", "protein_g", "carbs_g", "fat_g")), name


def test_open_table_resolves_app_foods_in_the_right_state():
    table = load_table()
    for food in ("rice", "wholemeal pasta", "quinoa", "couscous", "macaroni"):
        assert table[food]["state"] == "dry", food
    for food in ("chicken breast", "ground beef", "pork loin", "chicken thigh"):
        assert table[food]["state"] == "raw", food
    for name, record in table.items():
        frozen_name = "frozen" in name
        assert frozen_name == (record["state"] == "frozen"), name


def test_open_table_resolves_spanish_names():
    table = load_table()
    for es, en in (("arroz", "rice"), ("Garbanzos cocidos", "canned chickpeas"), ("yogur griego 0%", "greek yogurt 0%"),
                   ("judías verdes congeladas", "frozen green beans"), ("atún claro al natural lata", "canned tuna in water")):
        assert canonical(es) == en
        assert resolve(es, table=table).source_id == table[en]["source_id"], es
