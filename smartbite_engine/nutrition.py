"""Ingredient and meal macros from the open nutrition table (Ciqual 2025 and USDA FDC).

Order per ingredient: Open Food Facts by barcode when one is given, else data/open/nutrition/per-100g.json.
The LLM picks foods and grams; every number here comes from the table or a label.
"""
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

from .calc import Nutrition, egg_grams, per_serving, scale, total
from .names import canonical, plain

TABLE_PATH = Path(__file__).resolve().parents[1] / "data" / "open" / "nutrition" / "per-100g.json"
FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
DEFAULT_EGG_SIZE = "M"

FIBER_REFERENCE_G = 25  # EFSA adequate intake of fiber for adults, g per day
# Micronutrients: (key, label, unit, EU nutrient reference value for adults). A table record has the key only when
# its source has a value; a missing key is unknown, not 0.
MICROS = (("iron_mg", "Iron", "mg", 14), ("calcium_mg", "Calcium", "mg", 800),
          ("potassium_mg", "Potassium", "mg", 2000), ("magnesium_mg", "Magnesium", "mg", 375),
          ("zinc_mg", "Zinc", "mg", 10), ("vitamin_a_ug", "Vitamin A", "µg", 800),
          ("vitamin_c_mg", "Vitamin C", "mg", 80), ("vitamin_d_ug", "Vitamin D", "µg", 5),
          ("vitamin_b12_ug", "Vitamin B12", "µg", 2.5), ("folate_ug", "Folate", "µg", 200))
MICRO_KEYS = tuple(m[0] for m in MICROS)
MICRO_REFERENCE = "EU reference intakes (Regulation (EU) 1169/2011, Annex XIII)"
SIGNIFICANT_PCT = 15  # Annex XIII: 15% of the reference value is a significant amount
MIN_COUNTED_GRAMS = 2  # lines under 2 g per serving (spices, salt) are left out of the micronutrient coverage

# Fresh and frozen are never mixed, except plain frozen fruit (no syrup or sugar),
# which may use the fresh record
FROZEN_WORDS = ("congelad", "frozen", "surgel")
FRUIT_WORDS = ("arandano", "fresa", "frambuesa", "mora", "frutos rojos", "frutos del bosque", "mango", "pina",
               "cereza", "melocoton", "platano", "kiwi", "uva", "mandarina", "naranja", "manzana", "pera",
               "blueberr", "strawberr", "raspberr", "blackberr", "mixed berries", "pineapple", "cherries", "peach",
               "banana", "grape", "mandarin", "orange", "apple")
NOT_PLAIN = ("almibar", "azucar", "smoothie", "batido", "zumo", "mermelada", "sugar", "syrup", "juice", "jam")


def _frozen(text):
    return any(w in plain(text) for w in FROZEN_WORDS)


@dataclass(frozen=True)
class Resolved:
    ingredient: str
    per_100g: Nutrition
    source: str  # ciqual | usda | open_food_facts
    source_id: str | None
    source_name: str = ""
    state: str | None = None
    missing: tuple = ()  # fields with no value in the source, counted as 0
    micros: dict = field(default_factory=dict)  # micronutrients per 100 g, only the ones the source has


def load_table(path=TABLE_PATH):
    """{food key: record} from per-100g.json (keys are the English names, see smartbite_engine.names)."""
    foods = json.loads(Path(path).read_text(encoding="utf-8"))["foods"]
    return {plain(name): record for name, record in foods.items()}


OFF_FIELDS = {"kcal": "energy-kcal_100g", "protein_g": "proteins_100g",
              "carbs_g": "carbohydrates_100g", "fat_g": "fat_100g"}
OFF_FIBER = "fiber_100g"
# Open Food Facts stores minerals and vitamins in g per 100 g: (field, factor to the table's unit)
OFF_MICROS = {"iron_mg": ("iron_100g", 1e3), "calcium_mg": ("calcium_100g", 1e3),
              "potassium_mg": ("potassium_100g", 1e3), "magnesium_mg": ("magnesium_100g", 1e3),
              "zinc_mg": ("zinc_100g", 1e3), "vitamin_a_ug": ("vitamin-a_100g", 1e6),
              "vitamin_c_mg": ("vitamin-c_100g", 1e3), "vitamin_d_ug": ("vitamin-d_100g", 1e6),
              "vitamin_b12_ug": ("vitamin-b12_100g", 1e6), "folate_ug": ("vitamin-b9_100g", 1e6)}


def parse_off(json_text):
    """(product name, Nutrition, missing) from an Open Food Facts v2 product response."""
    data = json.loads(json_text)
    if data.get("status") != 1 or "product" not in data:
        raise LookupError(data.get("status_verbose", "product not found"))
    product = data["product"]
    nutriments = product.get("nutriments", {})
    missing = tuple(f for f, key in OFF_FIELDS.items() if nutriments.get(key) is None)
    nutrition = Nutrition(**{f: float(nutriments.get(key) or 0) for f, key in OFF_FIELDS.items()},
                          fiber_g=float(nutriments.get(OFF_FIBER) or 0))
    return product.get("product_name", ""), nutrition, missing


def off_micros(json_text):
    """Micronutrients per 100 g from an Open Food Facts v2 product response, in mg or µg; only the ones it has."""
    nutriments = json.loads(json_text).get("product", {}).get("nutriments", {})
    return {f: float(nutriments[key]) * factor for f, (key, factor) in OFF_MICROS.items()
            if nutriments.get(key) is not None}


def cache_loader(cache_dir, fetch=None):
    """Return load(kind, key) -> raw text. Reads cache_dir first; on a miss calls fetch and saves, or raises."""
    cache_dir = Path(cache_dir)

    def load(kind, key):
        if kind != "off":
            raise LookupError(f"no loader for {kind}")
        path = cache_dir / f"off_{key}.json"
        if path.exists():
            return path.read_text(encoding="utf-8")
        if fetch is None:
            raise LookupError(f"{path.name} not cached and no fetch given")
        text = fetch(kind, key)
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return text

    return load


def http_fetch(kind, key):
    """Fetch one Open Food Facts product. Headers carry only the app name."""
    import urllib.request
    if kind != "off":
        raise LookupError(f"no live fetch for {kind}")
    req = urllib.request.Request(f"https://world.openfoodfacts.org/api/v2/product/{key}.json"
                                 "?fields=code,product_name,nutriments", headers={"User-Agent": "SmartBite"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def _state_allowed(ingredient, product_name, state):
    """Fresh and frozen never mix. A frozen buy may use a fresh record only for plain fruit."""
    want_frozen = _frozen(ingredient) or _frozen(product_name)
    if want_frozen == (state == "frozen"):
        return True
    if want_frozen:
        names = f"{plain(ingredient)} | {canonical(ingredient) or ''}"
        return any(w in names for w in FRUIT_WORDS) and not any(
            w in plain(product_name) for w in NOT_PLAIN)
    return False


def find(ingredient, table):
    """Table record for an ingredient: its name as written, else its English key (Spanish names, plurals)."""
    record = table.get(plain(ingredient))
    return record if record is not None else table.get(canonical(ingredient))


def resolve(ingredient, *, table, barcode=None, product_name=None, load=None):
    """Nutrition per 100 g for one ingredient."""
    if barcode and load is not None:
        try:
            text = load("off", str(barcode))
            name, nutrition, missing = parse_off(text)
            return Resolved(ingredient, nutrition, "open_food_facts", str(barcode), name, None, missing,
                            off_micros(text))
        except LookupError:
            pass  # not on Open Food Facts: fall through to the table

    record = find(ingredient, table)
    if record is None:
        raise LookupError(f"no nutrition record for {ingredient!r}")
    if not _state_allowed(ingredient, product_name, record["state"]):
        raise LookupError(f"{ingredient}: record is {record['state']}, fresh and frozen are never mixed")
    return Resolved(ingredient, Nutrition(**{f: record[f] for f in FIELDS}, fiber_g=record.get("fiber_g") or 0.0),
                    record["source"], record["source_id"], record["source_name"], record["state"],
                    tuple(record.get("missing", ())), {k: record[k] for k in MICRO_KEYS if k in record})


@dataclass(frozen=True)
class IngredientMacros:
    ingredient: str
    grams: float
    per_100g: Nutrition
    amount: Nutrition
    source: str
    source_id: str | None
    missing: tuple
    micros: dict = field(default_factory=dict)  # micronutrient amounts for the grams, only the known ones


@dataclass(frozen=True)
class MealMacros:
    lines: list
    total: Nutrition
    per_serving: Nutrition


def item_grams(item):
    """Grams eaten for one recipe item: {"grams": g} or eggs as {"units": n, "egg_size": "M"}."""
    if "units" in item:
        return egg_grams(item["units"], item.get("egg_size", DEFAULT_EGG_SIZE))
    return item["grams"]


def ingredient_macros(ingredient, grams, *, table, barcode=None, product_name=None, load=None):
    found = resolve(ingredient, table=table, barcode=barcode, product_name=product_name, load=load)
    return IngredientMacros(ingredient, grams, found.per_100g, scale(found.per_100g, grams),
                            found.source, found.source_id, found.missing, scale_micros(found.micros, grams))


def meal_macros(items, servings, *, table, load=None):
    """items: (ingredient, grams) pairs or dicts {ingredient, grams | units, egg_size, barcode, product_name}
    for the whole meal. Macros are for what is eaten, not what is bought."""
    lines = []
    for item in items:
        if not isinstance(item, dict):
            item = {"ingredient": item[0], "grams": item[1]}
        lines.append(ingredient_macros(item["ingredient"], item_grams(item), table=table,
                                       barcode=item.get("barcode"), product_name=item.get("product_name"),
                                       load=load))
    meal_total = total(line.amount for line in lines)
    return MealMacros(lines, meal_total, per_serving(meal_total, servings))


def scale_micros(per_100g, grams):
    return {k: v * grams / 100 for k, v in per_100g.items()}


def percent(amount, reference):
    """Whole percent of a reference, half up (22.5 -> 23)."""
    return math.floor(amount / reference * 100 + 0.5)


def micros_block(lines, servings):
    """evaluation.macros.micros for the eaten lines [{name, grams, micros}], grams and micronutrient amounts for the
    whole meal. Every line adds the nutrients it has. Lines under 2 g per serving (spices, salt) are left out of the
    counts and the coverage, so a pinch with no data does not make the meal look incomplete."""
    counted = [l for l in lines if l["grams"] / servings >= MIN_COUNTED_GRAMS]
    nutrients = []
    for key, label, unit, nrv in MICROS:
        amount = sum(l["micros"].get(key, 0) for l in lines) / servings
        nutrients.append({"key": key, "label": label, "unit": unit, "per_serving": round(amount, 2), "nrv": nrv,
                          "pct": percent(amount, nrv),
                          "ingredients_with_data": sum(1 for l in counted if key in l["micros"]),
                          "ingredients_total": len(counted)})
    missing = [l["name"] for l in counted if any(k not in l["micros"] for k in MICRO_KEYS)]
    return {"nutrients": nutrients,
            "summary": {"at_least_15pct": sum(1 for n in nutrients if n["pct"] >= SIGNIFICANT_PCT),
                        "count": len(MICROS)},
            "coverage": {"with_data": len(counted) - len(missing), "total": len(counted), "missing": missing},
            "reference": MICRO_REFERENCE}
