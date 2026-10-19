"""Ingredient and meal macros from the open nutrition table (Ciqual 2025 and USDA FDC).

Order per ingredient: Open Food Facts by barcode when one is given, else data/open/nutrition/per-100g.json.
The LLM picks foods and grams; every number here comes from the table or a label.
"""
import json
from dataclasses import dataclass
from pathlib import Path

from .calc import Nutrition, egg_grams, per_serving, scale, total
from .names import canonical, plain

TABLE_PATH = Path(__file__).resolve().parents[1] / "data" / "open" / "nutrition" / "per-100g.json"
FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
DEFAULT_EGG_SIZE = "M"

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


def load_table(path=TABLE_PATH):
    """{food key: record} from per-100g.json (keys are the English names, see smartbite_engine.names)."""
    foods = json.loads(Path(path).read_text(encoding="utf-8"))["foods"]
    return {plain(name): record for name, record in foods.items()}


OFF_FIELDS = {"kcal": "energy-kcal_100g", "protein_g": "proteins_100g",
              "carbs_g": "carbohydrates_100g", "fat_g": "fat_100g"}


def parse_off(json_text):
    """(product name, Nutrition, missing) from an Open Food Facts v2 product response."""
    data = json.loads(json_text)
    if data.get("status") != 1 or "product" not in data:
        raise LookupError(data.get("status_verbose", "product not found"))
    product = data["product"]
    nutriments = product.get("nutriments", {})
    missing = tuple(field for field, key in OFF_FIELDS.items() if nutriments.get(key) is None)
    nutrition = Nutrition(**{field: float(nutriments.get(key) or 0) for field, key in OFF_FIELDS.items()})
    return product.get("product_name", ""), nutrition, missing


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
            name, nutrition, missing = parse_off(load("off", str(barcode)))
            return Resolved(ingredient, nutrition, "open_food_facts", str(barcode), name, None, missing)
        except LookupError:
            pass  # not on Open Food Facts: fall through to the table

    record = find(ingredient, table)
    if record is None:
        raise LookupError(f"no nutrition record for {ingredient!r}")
    if not _state_allowed(ingredient, product_name, record["state"]):
        raise LookupError(f"{ingredient}: record is {record['state']}, fresh and frozen are never mixed")
    return Resolved(ingredient, Nutrition(**{f: record[f] for f in FIELDS}), record["source"],
                    record["source_id"], record["source_name"], record["state"], tuple(record.get("missing", ())))


@dataclass(frozen=True)
class IngredientMacros:
    ingredient: str
    grams: float
    per_100g: Nutrition
    amount: Nutrition
    source: str
    source_id: str | None
    missing: tuple


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
                            found.source, found.source_id, found.missing)


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
