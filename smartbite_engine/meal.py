"""One recipe in, one Meal result out (docs/contracts/meal.schema.json). Pure code, no store, no LLM.

Per ingredient: English food key (names.canonical), nutrition (nutrition.py), a generic product option from the
typical pack sizes (generic_packs.product_option, with the user's price when one is given), pack_line, then
pack_meal for the whole cart. Macros are for what is eaten (pantry items included), packs for what is bought.

Names that are not a known food are listed in `unresolved`, never guessed: they get no nutrition (left out of the
totals and listed in missing_nutrition) and no pack size.

With a country ("ES" or "CA"), lines the user did not price get an estimated price from that country's
average prices (estimated_prices.py), for the same pack size the line buys without a price. The user's price wins.

A product the user saved for a food (request products, picked by the browser for their store) is that food's only
pack option; its price wins over everything else and its label replaces the nutrition table.
"""
import math
import re
from dataclasses import asdict, fields

from .calc import EGG_GRAMS, Nutrition, per_serving, scale, total
from .estimated_prices import for_region, load_estimates, pack_estimate, period
from .form import MealForm
from .generic_packs import buy_unpriced, load_packs, pack_entry, product_option
from .names import canonical, plain
from .nutrition import (FIBER_REFERENCE_G, FIELDS, IngredientMacros, ingredient_macros, load_table, micros_block,
                        percent)
from .pack import EGG_SIZE, HIGH_LEFTOVER_PCT, pack_line, pack_meal

MACRO_TOLERANCE = 0.10  # kcal within 10% of target, protein at least 90% of target
PROTEIN_MAX_OVER = 0.20  # protein more than 20% over target is a miss too
MACRO_FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")
EGGS = "eggs"

# Spices, salt, oil, vinegar, sauces and bottled juice: listed in the cart but out of cost, budget and leftover
# checks. Pantry items (pantry: true in the recipe) are optional too.
OPTIONAL_FOODS = frozenset({
    "salt", "black pepper", "paprika", "smoked paprika", "cumin", "curry powder", "cinnamon", "nutmeg", "oregano",
    "thyme", "dried parsley", "garlic powder", "onion powder", "ground ginger", "chili flakes",
    "extra virgin olive oil", "vinegar", "mustard", "soy sauce", "teriyaki sauce", "lemon juice", "lime juice"})


def to_form(form):
    """MealForm from a dict (common.schema.json MealForm) or a MealForm."""
    if isinstance(form, MealForm):
        return form
    known = {f.name for f in fields(MealForm)}
    values = {k: v for k, v in form.items() if k in known and v is not None}
    for key in ("exclude", "gear"):
        if key in values:
            values[key] = tuple(values[key])
    return MealForm(**values)


def form_dict(form):
    if isinstance(form, MealForm):
        return {k: list(v) if isinstance(v, tuple) else v for k, v in asdict(form).items()}
    return form


def _macros(n):
    return {k: round(getattr(n, k), 2) for k in MACRO_FIELDS}


def macro_check(per, form):
    """Misses per serving vs the form: kcal within 10%, protein 90% to 120% of target, carbs and fat under max."""
    misses = []
    if abs(per.kcal - form.kcal_target) > MACRO_TOLERANCE * form.kcal_target:
        misses.append(f"kcal {per.kcal:.0f} vs target {form.kcal_target:.0f}")
    if per.protein_g < (1 - MACRO_TOLERANCE) * form.protein_g_target:
        misses.append(f"protein {per.protein_g:.0f} g vs target {form.protein_g_target:.0f} g")
    if per.protein_g > (1 + PROTEIN_MAX_OVER) * form.protein_g_target:
        misses.append(f"protein {per.protein_g:.0f} g is more than 20% over target {form.protein_g_target:.0f} g: "
                      f"cut the protein ingredient")
    if form.carbs_g_max and per.carbs_g > form.carbs_g_max:
        misses.append(f"carbs {per.carbs_g:.0f} g over max {form.carbs_g_max:.0f} g")
    if form.fat_g_max and per.fat_g > form.fat_g_max:
        misses.append(f"fat {per.fat_g:.0f} g over max {form.fat_g_max:.0f} g")
    return misses


def items_for(recipe, servings):
    """Recipe ingredients scaled to all servings, with the English food key (None when unknown).
    Eggs with units_per_serving count in units (size M, 51 g each); everything else in grams."""
    out = []
    for ing in recipe["ingredients"]:
        name = ing["name"].strip()
        food = canonical(name)
        units = ing.get("units_per_serving") or 0
        is_egg = food == EGGS and units > 0
        per = units * EGG_GRAMS[EGG_SIZE] if is_egg else ing["grams_per_serving"]
        out.append({"name": name, "food": food, "grams_per_serving": per, "total_grams": per * servings,
                    "units_total": math.ceil(units * servings) if is_egg else None,
                    "storage": ing["storage"], "pantry": bool(ing["pantry"]), "dry": bool(ing["dry"]),
                    "optional": bool(ing["pantry"]) or food in OPTIONAL_FOODS,
                    "leftover_plan": ing.get("leftover_plan")})
    return out


def product_errors(products):
    """Rules the API's JSON Schema cannot express for products: one per food, the pack field that matches sold_by,
    barcode digits and the price date format."""
    seen, errors = set(), []
    for i, p in enumerate(products or []):
        food = p["food"].strip().lower()
        if food in seen:
            errors.append(f"products[{i}]: second product for {p['food']}; send one per food")
        seen.add(food)
        if p["sold_by"] == "per_unit":
            if "units_per_pack" not in p or "pack_grams" in p:
                errors.append(f"products[{i}]: sold per unit needs units_per_pack and no pack_grams")
        elif "pack_grams" not in p or "units_per_pack" in p:
            errors.append(f"products[{i}]: sold {p['sold_by']} needs pack_grams and no units_per_pack")
        if "barcode" in p and not re.fullmatch(r"\d{8,14}", p["barcode"]):
            errors.append(f"products[{i}]: barcode must be 8 to 14 digits")
        if "price_date" in p and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", p["price_date"]):
            errors.append(f"products[{i}]: price_date must be YYYY-MM-DD")
    return errors


def _prices_by_food(prices):
    """The API's list form [{food, pack_grams, price_eur}] as {food key: {"pack_prices": {pack grams: price}}}."""
    out = {}
    for p in prices:
        out.setdefault(p["food"].strip().lower(), {"pack_prices": {}})["pack_prices"][float(p["pack_grams"])] = p["price_eur"]
    return out


def _size_for(entry, pack_grams):
    """The typical size (grams, or units for eggs) whose pack weighs pack_grams, or None when it is not one."""
    per_unit = entry["sold_by"] == "per_unit"
    default = entry["units_per_pack"] if per_unit else entry["default_grams"]
    sizes = [s["units"] if per_unit else s["grams"] for s in entry.get("typical_packs") or []] + [default]
    weight = (lambda s: s * EGG_GRAMS[EGG_SIZE]) if per_unit else (lambda s: s)
    return next((s for s in sizes if math.isclose(weight(s), pack_grams)), None)


def _priced_entry(entry, pack_prices):
    """(entry, price) for user prices per pack size. When the default size has no price, the first priced typical
    size becomes the default, so a price typed for the pack the page shows always counts. Sizes that are not a
    typical size of the food are ignored."""
    by_size = {}
    for grams, price in pack_prices.items():
        size = _size_for(entry, grams)
        if size is not None:
            by_size[size] = price
    if not by_size:
        return entry, {}
    per_unit = entry["sold_by"] == "per_unit"
    field = "units_per_pack" if per_unit else "default_grams"
    default = entry[field]
    if default not in by_size:
        order = [s["units"] if per_unit else s["grams"] for s in entry.get("typical_packs") or []]
        default = next((s for s in order if s in by_size), next(iter(by_size)))
        entry = {**entry, field: default}
    others = {s: p for s, p in by_size.items() if s != default}
    return entry, {"price_eur": by_size[default], "other_prices": others}


def _price(prices, item, key=None):
    """User price for one item: prices maps a food key (or the name as written) to a number (price of the default
    pack, for loose items the default unit), to {price_eur, other_prices, price_date}, or to {pack_prices: {pack
    grams: price}} (the API's list form, see _prices_by_food)."""
    if not prices:
        return {}
    for name in (key, item["food"], item["name"], plain(item["name"])):
        if name and name in prices:
            value = prices[name]
            return value if isinstance(value, dict) else {"price_eur": value}
    return {}


def _leftover_status(grams_left, storage, leftover_plan):
    if grams_left <= 0:
        return "none"
    if leftover_plan == "use_in_another_meal":
        return "use_in_another_meal"
    return "keeps" if storage in ("keeps", "frozen") else "use_in_2_days"


def _size_key(item, option):
    bought = buy_unpriced(item["total_grams"], option, item["units_total"])
    return bought["grams_bought"], bought["packs_to_buy"]


def _unpriced_size(item, option, keep_leftovers_low):
    """The typical size an unpriced line buys. Fresh food with "keep leftovers low" takes the size that buys the
    fewest grams (fewer packs on a tie); the rest the most common size."""
    sizes = [option]
    if keep_leftovers_low and item["storage"] == "fresh":
        sizes += [{**o, "sold_by": option["sold_by"]} for o in option["other_options"]]
    return min(sizes, key=lambda o: _size_key(item, o))


def _estimated_line(item, key, entry, keep_leftovers_low, estimates, common):
    """Line priced with the country's estimate for the pack size the line buys without a price (so packs, grams and
    leftovers stay the same), or None when the food has no estimate."""
    record = estimates["foods"].get(key)
    if not record:
        return None
    picked = _unpriced_size(item, product_option(key, entry), keep_leftovers_low)
    if entry["sold_by"] == "per_unit":
        size = {"units": picked["units_per_pack"]}
        price, one = pack_estimate(record, units=size["units"]), {**entry, "units_per_pack": size["units"]}
    else:
        size = {"grams": picked["pack_grams"]}
        price, one = pack_estimate(record, grams=size["grams"]), {**entry, "default_grams": size["grams"]}
    if price is None:
        return None
    option = {**product_option(key, {**one, "typical_packs": [size]}, price_eur=price),
              "price_source": "estimate", "price_date": estimates["period_to"]}
    line = pack_line(item["name"], item["total_grams"], option, main_word=key,
                     prefer_less_leftover=keep_leftovers_low, **common)
    return {**line, **_estimate_fields(estimates, record), "food": key}


def _estimate_fields(estimates, record):
    """Line fields of an estimated price: its months, and its region when the price is regional."""
    return {"price_period": period(estimates), **({"price_region": record["region"]} if "region" in record else {})}


def _products_by_food(products):
    """The API's products list as {food key: product}."""
    return {p["food"].strip().lower(): p for p in products or []}


def _product_line(item, key, product, keep_leftovers_low, estimates, common):
    """Cart line from the user's saved product: its pack size is the only option (always: never swapped), its price
    prices the line. With no price, a country's estimate for that pack size prices it, else it is unpriced."""
    sold_by, grams, units = product["sold_by"], product.get("pack_grams"), product.get("units_per_pack")
    price, source, date, extra = product.get("price_eur"), "user", product.get("price_date"), {}
    record = (estimates or {}).get("foods", {}).get(key)
    if price is None and record:
        price = pack_estimate(record, units=units) if sold_by == "per_unit" else pack_estimate(record, grams=grams)
        if price is not None:
            source, date, extra = "estimate", estimates["period_to"], _estimate_fields(estimates, record)
    priced = price is not None
    option = {"name": product["name"], "link": None, "sold_by": sold_by, "pack_grams": grams, "units_per_pack": units,
              "price_eur": price, "price_per_kg_eur": price / grams * 1000 if priced and sold_by == "per_kg" else None,
              "other_options": [], "always": True, "price_date": date if priced else None,
              "price_source": source if priced else None}
    line = pack_line(item["name"], item["total_grams"], option, main_word=key,
                     prefer_less_leftover=keep_leftovers_low, **common)
    if not priced:
        bought = buy_unpriced(item["total_grams"], option, item["units_total"])
        line.update(bought, price_source=None, price_date=None,
                    leftover_pct=100 * bought["grams_left"] / bought["grams_bought"] if bought["grams_bought"] else 0.0,
                    leftover_status=_leftover_status(bought["grams_left"], item["storage"], item["leftover_plan"]))
    return {**line, **extra, "food": key, "user_product": True}


def _pack_line(item, packs, keep_leftovers_low, prices, estimates=None, products=None):
    """Cart line for one item, or None for a pantry item with no pack size (assumed at home, no line).
    estimates: a country's price table (estimated_prices.load_estimates) for lines the user did not price.
    products: the user's saved products by food key (_products_by_food); a product wins over typical packs."""
    found = pack_entry(item["food"], packs) if item["food"] else None
    common = dict(units_needed=item["units_total"], storage=item["storage"], leftover_plan=item["leftover_plan"],
                  optional=item["optional"])
    key = found[0] if found else item["food"]
    if key and key in (products or {}):
        return _product_line(item, key, products[key], keep_leftovers_low, estimates, common)
    if found is None and item["pantry"]:
        return None
    if found is None:  # unknown food: listed, no pack size, no price
        return {**pack_line(item["name"], item["total_grams"], None, **common), "food": item["food"]}
    key, entry = found
    price = _price(prices, item, key)
    if "pack_prices" in price:
        entry, price = _priced_entry(entry, price["pack_prices"])
    if estimates and price.get("price_eur") is None:
        estimated = _estimated_line(item, key, entry, keep_leftovers_low, estimates, common)
        if estimated:
            return estimated
    option = product_option(key, entry, price_eur=price.get("price_eur"), other_prices=price.get("other_prices"),
                            price_date=price.get("price_date"))
    line = pack_line(item["name"], item["total_grams"], option, main_word=key,
                     prefer_less_leftover=keep_leftovers_low, **common)
    if not line["has_price"]:
        # No price: grams bought and leftovers still come from the typical pack sizes
        picked = _unpriced_size(item, option, keep_leftovers_low)
        bought = buy_unpriced(item["total_grams"], picked, item["units_total"])
        line.update(bought, product_name=picked["name"], price_source="typical", price_date=None,
                    leftover_pct=100 * bought["grams_left"] / bought["grams_bought"] if bought["grams_bought"] else 0.0,
                    leftover_status=_leftover_status(bought["grams_left"], item["storage"], item["leftover_plan"]))
    return {**line, "food": key}


def _unpriced_leftover_requests(lines):
    """pack_meal checks leftovers on priced lines only; the same rule for unpriced lines with a typical pack."""
    out = []
    for l in lines:
        if (not l.get("optional") and not l["has_price"] and l.get("grams_bought") and l["storage"] == "fresh"
                and l["leftover_pct"] > HIGH_LEFTOVER_PCT and l["leftover_status"] != "use_in_another_meal"):
            out.append({"from_agent": "pack", "ingredient": l["ingredient"], "reason": "high_leftover",
                        "hint": f"Buying {l['grams_bought']:.0f} g but using {l['grams_needed']:.0f} g "
                                f"({l['leftover_pct']:.0f}% left, spoils fast). Do not grow the portion: "
                                f"grams may change at most 15% from the first recipe. Use a different "
                                f"ingredient, or mark the leftover to use in another meal "
                                f"(leftover_plan \"use_in_another_meal\")."})
    return out


def _label_macros(food, grams, product):
    """Macros from the label on the user's saved product (source "label", or "open_food_facts" when a barcode lookup
    filled it): it wins over the nutrition table."""
    per = product["per_100g"]
    label = Nutrition(**{f: per[f] for f in FIELDS}, fiber_g=per.get("fiber_g") or 0.0)  # labels carry no micros
    source = "open_food_facts" if product.get("label_source") == "open_food_facts" else "label"
    return IngredientMacros(food, grams, label, scale(label, grams), source, product.get("barcode"), ())


def _macro_lines(items, table, products=None):
    lines, missing = [], []
    for it in items:
        if it["food"] is None:
            missing.append(f"{it['name']}: unknown food, left out of the totals")
            continue
        product = (products or {}).get(it["food"])
        try:
            if product and product.get("per_100g"):
                got = _label_macros(it["food"], it["total_grams"], product)
            else:
                got = ingredient_macros(it["food"], it["total_grams"], table=table)
        except LookupError:
            missing.append(f"{it['name']}: no nutrition record, left out of the totals")
            continue
        lines.append({"name": it["name"], "food": it["food"], "grams": it["total_grams"], "source": got.source,
                      "source_id": got.source_id, "amount": got.amount, "missing": list(got.missing),
                      "micros": got.micros})
        if got.missing:
            missing.append(f"{it['name']}: no {', '.join(got.missing)} value in the source, counted as 0")
    return lines, missing


def evaluate(form, picked_idea, recipe, profile=None, prices=None, country=None, products=None, *, region=None,
             table=None, packs=None, estimates=None):
    """Meal result for one recipe. form: dict or MealForm; servings come from the form.

    profile: the user's Kitchen Profile; accepted for the API contract, the math does not depend on it.
    prices: optional user prices, {food key: price of the default pack}, {food key: {price_eur, other_prices,
    price_date}}, or the API's list form [{food, pack_grams, price_eur}] (docs/contracts/evaluate.schema.json).
    With no prices the budget check is marked incomplete and every line uses typical pack sizes.
    country: optional, "ES" or "CA": lines without a user price get an estimated price (price_source "estimate"); the pack
    then says whether the budget counts estimates (prices_estimated) and where they come from (estimate_source).
    Without a country the reply is the same as before estimates existed.
    region: optional, with a country only, e.g. "ES-MD": foods with a regional average use it (line price_region)
    and estimate_source names the region; the other foods keep the national estimate.
    products: optional saved products, the API's list form (docs/contracts/evaluate.schema.json Product), at most
    one per food. A product is the only pack option for its food (line user_product true), its price wins over
    prices and estimates, and its label (per_100g) replaces the nutrition table (macro line source "label").
    table, packs: nutrition and pack data (default: data/open). estimates: a price table in place of the country's.
    """
    if isinstance(prices, list):
        prices = _prices_by_food(prices)
    products = _products_by_food(products)
    meal_form = to_form(form)
    table = load_table() if table is None else table
    packs = load_packs() if packs is None else packs
    servings = meal_form.servings
    items = items_for(recipe, servings)

    if region and not country:
        raise ValueError("region needs a country")
    if country and estimates is None:
        estimates = for_region(load_estimates(country), region)
    lines = [l for l in (_pack_line(it, packs, meal_form.keep_leftovers_low, prices, estimates, products)
                         for it in items) if l]
    pack = pack_meal(lines, servings=servings, budget_total_eur=meal_form.budget_total_eur,
                     keep_leftovers_low=meal_form.keep_leftovers_low)
    if meal_form.keep_leftovers_low:
        pack["change_requests"] += _unpriced_leftover_requests(lines)
    # Leftover grams over every bought line with a pack size, priced or not
    pack["waste_grams"] = sum(max(l.get("grams_left") or 0, 0) for l in lines
                              if not l.get("optional") and l.get("grams_bought"))
    if country:
        # The budget counts estimates: say so when any bought line priced in the total is one
        pack["prices_estimated"] = any(l["has_price"] and l.get("price_source") == "estimate"
                                       for l in lines if not l.get("optional"))
        pack["estimate_source"] = {k: estimates[k] for k in ("country", "currency", "source", "period_from",
                                                            "period_to", "built", "region", "region_name")
                                   if k in estimates}

    macro_lines, missing = _macro_lines(items, table, products)
    meal_total = total(l["amount"] for l in macro_lines)
    per = per_serving(meal_total, servings)
    misses = macro_check(per, meal_form)
    micros = micros_block(macro_lines, servings)
    unresolved = [it["name"] for it in items if it["food"] is None]

    requests = list(pack["change_requests"])
    if misses:
        requests.append({"from_agent": "macro", "ingredient": None, "reason": "misses_macros",
                         "hint": "Per serving: " + "; ".join(misses) + ". Adjust grams or swap ingredients."})
    evaluation = {
        "status": "issues" if requests or unresolved else "ok",
        "recipe_title": recipe["title"],
        "items": items,
        "pack": pack,
        "macros": {"per_serving": _macros(per), "total": _macros(meal_total), "misses": misses,
                   "fiber_pct": percent(per.fiber_g, FIBER_REFERENCE_G), "micros": micros,
                   "missing_nutrition": missing, "unresolved": unresolved,
                   "lines": [{**{k: v for k, v in l.items() if k != "micros"}, "amount": _macros(l["amount"])}
                             for l in macro_lines]},
        "change_requests": requests,
    }
    return {"form": form_dict(form), "picked_idea": picked_idea, "recipe": recipe, "evaluation": evaluation}
