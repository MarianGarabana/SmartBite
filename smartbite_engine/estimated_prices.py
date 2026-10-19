"""Estimated pack prices per country (data/open/prices/<country>.json). Pure code, no store.

Spain (ES): average price paid by households, MAPA Panel de consumo alimentario en hogares, volume-weighted over
12 months (data/open/prices/SOURCES.md). Only foods with an exact or close panel row have one. A pack's estimate is
price per kg x pack weight (eggs: price per egg x eggs), rounded to 0.05 EUR; a price the user types always wins.
"""
import json
from functools import lru_cache
from pathlib import Path

PRICES_DIR = Path(__file__).resolve().parents[1] / "data" / "open" / "prices"
COUNTRIES = ("ES",)
STEP_EUR = 0.05


@lru_cache(maxsize=None)
def load_estimates(country):
    """The price table for one country: {country, currency, source, period_from, period_to, built, foods}."""
    if country not in COUNTRIES:
        raise ValueError(f"no estimated prices for country {country!r}; known: {', '.join(COUNTRIES)}")
    with open(PRICES_DIR / f"{country.lower()}.json", encoding="utf-8") as f:
        return json.load(f)


def round_price(eur):
    """Rounded to 0.05 EUR, never below 0.05."""
    return max(STEP_EUR, round(round(eur / STEP_EUR) * STEP_EUR, 2))


def pack_estimate(record, *, grams=None, units=None):
    """Estimated price of one pack: units for eggs (price per egg), else grams (price per kg). None when the food's
    record has no price for that kind of pack."""
    if units is not None:
        per = record.get("price_per_unit_eur")
        return None if per is None else round_price(per * units)
    per = record.get("price_per_kg_eur")
    return None if per is None or not grams else round_price(per * grams / 1000)


def period(table):
    """'2025-08/2026-07' for the table's months."""
    return f"{table['period_from']}/{table['period_to']}"
