"""Pack math: recipe grams -> what you must buy. Pure code, no LLM."""
import math
import re

from .calc import EGG_GRAMS

PRICE_NOTE = "Final price depends on the exact weight delivered."
EGG_SIZE = "M"
HIGH_LEFTOVER_PCT = 25.0  # Phase 3 test: leftover under 25% of grams bought for fresh items
UNITS_RE = re.compile(r"(\d+)\s*uds?\b", re.I)
SIZE_RE = re.compile(r"\bclase\s+(XL|S|M|L)\b", re.I)


def _buy(grams_needed, option, sold_by, units_needed=None, units_per_pack=None):
    """Packs, grams bought and costs for one product option."""
    price = option.get("price_eur")
    if sold_by == "per_unit":
        units = units_needed if units_needed is not None else math.ceil(grams_needed / EGG_GRAMS[EGG_SIZE])
        packs = math.ceil(units / units_per_pack)
        units_bought = packs * units_per_pack
        return {"packs_to_buy": packs, "units_needed": units, "units_bought": units_bought,
                "grams_bought": units_bought * EGG_GRAMS[EGG_SIZE],
                "cost_bought_eur": packs * price, "cost_used_eur": units / units_per_pack * price}
    if sold_by == "per_kg":
        # Loose items: bought in the unit the store sells (usually 1 kg, sometimes less, e.g. avocado 600 g) at the price per kg
        per_kg = option.get("price_per_kg_eur") or price
        unit = option.get("pack_grams") or 1000
        units = math.ceil(grams_needed / unit)
        return {"packs_to_buy": units, "grams_bought": units * unit,
                "cost_bought_eur": units * unit / 1000 * per_kg, "cost_used_eur": grams_needed / 1000 * per_kg}
    pack_grams = option["pack_grams"]
    packs = math.ceil(grams_needed / pack_grams)
    return {"packs_to_buy": packs, "grams_bought": packs * pack_grams,
            "cost_bought_eur": packs * price, "cost_used_eur": grams_needed / pack_grams * price}


def _candidates(product, main_word):
    """The matched product plus its other pack options that are the same food (same main word)."""
    yield product
    # "always": the user's own product, never swapped for another pack
    if not main_word or product.get("always"):
        return
    for option in product.get("other_options") or []:
        if option.get("pack_grams") and option.get("price_eur") and main_word.lower() in option["name"].lower():
            yield {**option, "sold_by": product["sold_by"]}


def _unit_candidates(product):
    """Per-unit product (eggs) plus its other packs of the same size class, each with its own unit count."""
    yield product
    size = SIZE_RE.search(product["name"])
    for option in product.get("other_options") or []:
        units, option_size = UNITS_RE.search(option["name"]), SIZE_RE.search(option["name"])
        if (units and option.get("price_eur") and size and option_size
                and option_size.group(1).upper() == size.group(1).upper()):
            yield {**option, "units_per_pack": int(units.group(1))}


def pack_line(ingredient, grams_needed, product, *, units_needed=None, storage=None, main_word=None,
              prefer_less_leftover=False, leftover_plan=None, optional=False):
    # optional: spices, oil, sauces, bottled juice; the user decides in the cart
    line = {"ingredient": ingredient, "grams_needed": grams_needed, "storage": storage, "optional": optional}
    if not product or product.get("price_eur") is None:
        return {**line, "has_price": False, "product_name": ((product or {}).get("name") or "").rstrip(". ") or None,
                "product_url": (product or {}).get("link"), "sold_by": (product or {}).get("sold_by"),
                "cost_bought_eur": None, "cost_used_eur": None}

    sold_by = product["sold_by"]
    used = lambda b: b.get("units_needed", 0) * EGG_GRAMS[EGG_SIZE] if sold_by == "per_unit" else grams_needed
    # Fresh food with "keep leftovers low": lowest price paid plus value of the leftover wins (least leftover
    # first bought 6 x 20 g parsley at 9.90 EUR to save 5 g over one 1.69 EUR bunch)
    by_leftover = prefer_less_leftover and storage == "fresh"
    best = None
    options = _unit_candidates(product) if sold_by == "per_unit" else _candidates(product, main_word if sold_by == "pack" else None)
    for option in options:
        bought = _buy(grams_needed, option, sold_by, units_needed, option.get("units_per_pack") or product.get("units_per_pack"))
        cost, left = round(bought["cost_bought_eur"], 2), bought["grams_bought"] - used(bought)
        waste = cost * left / bought["grams_bought"] if bought["grams_bought"] else 0
        key = (round(cost + waste, 4), left) if by_leftover else (cost, bought["grams_bought"])
        if best is None or key < best[0]:
            best = (key, option, bought)
    _, option, bought = best

    grams_left = bought["grams_bought"] - used(bought)
    if grams_left <= 0:
        status = "none"
    elif leftover_plan == "use_in_another_meal":
        status = "use_in_another_meal"
    else:
        status = "keeps" if storage in ("keeps", "frozen") else "use_in_2_days"
    return {**line, **bought, "has_price": True, "sold_by": sold_by,
            "product_name": option["name"].rstrip(". "), "product_url": option["link"],
            "price_date": product.get("price_date"), "price_source": product.get("price_source", "curated"),
            "grams_left": grams_left, "leftover_pct": 100 * grams_left / bought["grams_bought"],
            "leftover_status": status}


def pack_meal(lines, *, servings, budget_total_eur, keep_leftovers_low):
    # Optional lines are listed but left out of cost, budget, waste and leftover checks
    optional = [l for l in lines if l.get("optional")]
    bought = [l for l in lines if not l.get("optional")]
    priced = [l for l in bought if l["has_price"]]
    cart_total = sum(l["cost_bought_eur"] for l in priced)
    used_total = sum(l["cost_used_eur"] for l in priced)
    within = cart_total <= budget_total_eur
    requests = []
    if not within:
        worst = max(priced, key=lambda l: l["cost_bought_eur"])
        requests.append({"from_agent": "pack", "ingredient": worst["ingredient"], "reason": "over_budget",
                         "hint": f"Cart is {cart_total - budget_total_eur:.2f} EUR over the {budget_total_eur:.2f} EUR budget. "
                                 f"Swap {worst['ingredient']} ({worst['cost_bought_eur']:.2f} EUR) for a cheaper food, "
                                 f"or use a bigger pack with a lower price per kg."})
    if keep_leftovers_low:
        for l in priced:
            if (l["storage"] == "fresh" and l["leftover_pct"] > HIGH_LEFTOVER_PCT
                    and l["leftover_status"] != "use_in_another_meal"):
                requests.append({"from_agent": "pack", "ingredient": l["ingredient"], "reason": "high_leftover",
                                 "hint": f"Buying {l['grams_bought']:.0f} g but using {l['grams_needed']:.0f} g "
                                         f"({l['leftover_pct']:.0f}% left, spoils fast). Do not grow the portion: "
                                         f"grams may change at most 15% from the first recipe. Use a different "
                                         f"ingredient, or mark the leftover to use in another meal "
                                         f"(leftover_plan \"use_in_another_meal\")."})
    return {"lines": lines, "cart_total_eur": cart_total, "cost_per_serving_eur": cart_total / servings,
            "used_total_eur": used_total, "waste_grams": sum(max(l["grams_left"], 0) for l in priced),
            "waste_eur": cart_total - used_total, "within_budget": within,
            "over_budget_eur": None if within else cart_total - budget_total_eur,
            "optional_total_eur": sum(l["cost_bought_eur"] for l in optional if l["has_price"]),
            "budget_check_complete": len(priced) == len(bought),
            "unpriced": [l["ingredient"] for l in bought if not l["has_price"]],
            "price_note": PRICE_NOTE if any(l.get("sold_by") == "per_kg" for l in priced) else None,
            "change_requests": requests}
