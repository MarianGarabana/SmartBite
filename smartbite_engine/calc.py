from dataclasses import dataclass

# Edible grams per egg by EU size class (S 42, M 51, L 60, XL 69).
EGG_GRAMS = {"S": 42, "M": 51, "L": 60, "XL": 69}


@dataclass(frozen=True)
class Nutrition:
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float = 0.0  # 0 when the source has no fiber value

    def __add__(self, other):
        return Nutrition(self.kcal + other.kcal, self.protein_g + other.protein_g,
                         self.carbs_g + other.carbs_g, self.fat_g + other.fat_g, self.fiber_g + other.fiber_g)

    def times(self, factor):
        return Nutrition(self.kcal * factor, self.protein_g * factor,
                         self.carbs_g * factor, self.fat_g * factor, self.fiber_g * factor)

    # pytest.approx compares dataclasses field by field through these
    def __iter__(self):
        return iter((self.kcal, self.protein_g, self.carbs_g, self.fat_g, self.fiber_g))

    def __len__(self):
        return 5


def scale(per_100g, grams):
    if grams < 0:
        raise ValueError(f"grams must be >= 0, got {grams}")
    return per_100g.times(grams / 100)


def total(items):
    result = Nutrition(0, 0, 0, 0)
    for item in items:
        result = result + item
    return result


def per_serving(meal, servings):
    if not 1 <= servings <= 8:
        raise ValueError(f"servings must be 1 to 8, got {servings}")
    return meal.times(1 / servings)


def egg_grams(count, size):
    if size not in EGG_GRAMS:
        raise ValueError(f"unknown egg size {size!r}, expected one of {sorted(EGG_GRAMS)}")
    return count * EGG_GRAMS[size]
