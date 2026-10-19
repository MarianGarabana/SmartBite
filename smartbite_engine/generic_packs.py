"""Generic product options from typical pack sizes (data/open/packs/packs.json). Pure code, no store."""
import json
import math
from pathlib import Path

from .calc import EGG_GRAMS
from .names import canonical
from .pack import EGG_SIZE

PACKS_PATH = Path(__file__).resolve().parents[1] / "data" / "open" / "packs" / "packs.json"


def load_packs(path=PACKS_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["foods"]


def pack_entry(name, packs=None):
    """(food key, packs.json entry) for a food name in any language or spelling, or None when it has no entry."""
    packs = load_packs() if packs is None else packs
    for key in (name, canonical(name)):
        if key in packs:
            return key, packs[key]
    return None


def _name(food, sold_by, grams, units=None):
    if sold_by == "per_unit":
        # pack.py compares other egg packs by "clase <size>" and "<n> uds" in the name
        return f"{food} clase {EGG_SIZE} {units} uds"
    if sold_by == "per_kg":
        return f"{food}, loose ({grams:g} g)"
    return f"{food} {grams:g} g"


def _option(food, entry, size, price):
    sold_by = entry["sold_by"]
    if sold_by == "per_unit":
        return {"name": _name(food, sold_by, None, size["units"]), "link": None, "pack_grams": None,
                "units_per_pack": size["units"], "price_eur": price, "price_per_kg_eur": None}
    grams = size["grams"]
    # Not rounded: pack.py prices loose units from it, and a rounded per kg price is off for small units (58 g lemon)
    return {"name": _name(food, sold_by, grams), "link": None, "pack_grams": grams, "units_per_pack": None,
            "price_eur": price, "price_per_kg_eur": None if price is None else price / grams * 1000}


def product_option(food, entry, price_eur=None, other_prices=None, price_date=None):
    """Product option dict for pack_line from one packs.json entry.

    price_eur: the user's price for the default pack (for loose items, the price of the default unit).
    other_prices: optional {grams or units: price} for the other typical sizes.
    No price means price_eur None: pack_line flags the line unpriced; use buy_unpriced for grams.
    """
    other_prices = other_prices or {}
    key = "units" if entry["sold_by"] == "per_unit" else "grams"
    default = entry["units_per_pack"] if key == "units" else entry["default_grams"]
    sizes = entry.get("typical_packs") or [{key: default}]
    first = next((s for s in sizes if s[key] == default), {key: default})
    option = _option(food, entry, first, price_eur)
    others = [_option(food, entry, s, other_prices.get(s[key])) for s in sizes if s[key] != default]
    # Other sizes count only next to a priced default (pack_line skips the line when the default has no price)
    priced = price_eur is not None
    return {**option, "sold_by": entry["sold_by"], "other_options": others, "always": False,
            "price_date": price_date if priced else None, "price_source": "user" if priced else None}


def buy_unpriced(grams_needed, option, units_needed=None):
    """Packs, grams bought and grams left for one option, no price needed (pack_line skips these when unpriced)."""
    if option["sold_by"] == "per_unit":
        egg = EGG_GRAMS[EGG_SIZE]
        units = units_needed if units_needed is not None else math.ceil(grams_needed / egg)
        packs = math.ceil(units / option["units_per_pack"])
        units_bought = packs * option["units_per_pack"]
        return {"packs_to_buy": packs, "units_needed": units, "units_bought": units_bought,
                "grams_bought": units_bought * egg, "grams_left": (units_bought - units) * egg}
    # Loose items default to 1 kg units, like pack.py
    unit = option.get("pack_grams") or (1000 if option["sold_by"] == "per_kg" else None)
    if not unit:
        raise ValueError(f"no pack size for {option.get('name')}")
    packs = math.ceil(grams_needed / unit)
    return {"packs_to_buy": packs, "grams_bought": packs * unit, "grams_left": packs * unit - grams_needed}
