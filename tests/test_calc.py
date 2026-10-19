import pytest

from smartbite_engine.calc import Nutrition, egg_grams, per_serving, scale, total


def test_scale_per_100g_to_grams():
    per100 = Nutrition(kcal=100, protein_g=5.7, carbs_g=12.0, fat_g=1.9)
    got = scale(per100, grams=250)
    assert got == pytest.approx(Nutrition(kcal=250, protein_g=14.25, carbs_g=30.0, fat_g=4.75))


def test_scale_rejects_negative_grams():
    with pytest.raises(ValueError):
        scale(Nutrition(100, 1, 1, 1), grams=-5)


def test_total_adds_items():
    a = Nutrition(kcal=100, protein_g=10, carbs_g=5, fat_g=2)
    b = Nutrition(kcal=50, protein_g=1, carbs_g=10, fat_g=0.5)
    assert total([a, b]) == pytest.approx(Nutrition(kcal=150, protein_g=11, carbs_g=15, fat_g=2.5))


def test_total_of_nothing_is_zero():
    assert total([]) == Nutrition(0, 0, 0, 0)


def test_per_serving_divides_by_servings():
    meal = Nutrition(kcal=1800, protein_g=180, carbs_g=160, fat_g=40)
    assert per_serving(meal, servings=4) == pytest.approx(Nutrition(450, 45, 40, 10))


@pytest.mark.parametrize("servings", [0, 9])
def test_per_serving_only_1_to_8(servings):
    with pytest.raises(ValueError):
        per_serving(Nutrition(1, 1, 1, 1), servings=servings)


@pytest.mark.parametrize("size,count,grams", [("S", 1, 42), ("M", 3, 153), ("L", 2, 120), ("XL", 1, 69)])
def test_egg_grams_by_confirmed_size_table(size, count, grams):
    # Edible grams per egg: S 42, M 51, L 60, XL 69
    assert egg_grams(count=count, size=size) == grams


def test_egg_grams_unknown_size():
    with pytest.raises(ValueError):
        egg_grams(count=1, size="XXL")
