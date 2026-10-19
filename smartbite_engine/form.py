"""Make Your Meal form."""
from dataclasses import dataclass, field

GEAR = {"microwave_only", "oven", "no_blender"}


@dataclass(frozen=True)
class MealForm:
    craving: str
    servings: int
    budget_total_eur: float  # whole meal, all servings, counted on what you buy
    exclude: tuple = ()
    kcal_target: float = 450
    protein_g_target: float = 45
    carbs_g_max: float | None = None
    fat_g_max: float | None = None
    keep_leftovers_low: bool = True
    time_limit_min: int | None = None
    gear: tuple = field(default_factory=tuple)
    reheat_at_work: bool = False

    def __post_init__(self):
        if not 1 <= self.servings <= 8:
            raise ValueError(f"servings must be 1 to 8, got {self.servings}")
        if self.budget_total_eur <= 0:
            raise ValueError("budget must be above 0")
        unknown = set(self.gear) - GEAR
        if unknown:
            raise ValueError(f"unknown gear {sorted(unknown)}, expected {sorted(GEAR)}")

    @property
    def budget_per_serving_eur(self):
        return self.budget_total_eur / self.servings
