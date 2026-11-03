"""Estimated pack prices per country (data/open/prices/<country>.json). Pure code, no store.

Spain (ES): average price paid by households, MAPA Panel de consumo alimentario en hogares, volume-weighted over
12 months (data/open/prices/SOURCES.md). Only foods with an exact or close panel row have one. With a region
(comunidad autonoma, e.g. "ES-MD"), foods with a regional price use it and the rest the national one.
Canada (CA): average price paid (grocery transaction data), Statistics Canada table 18-10-0245-01, mean of 12 months, in CAD (the _eur fields
hold the table's currency), national only.
United Kingdom (GB): average price, ONS Shopping prices comparison tool (price quotes and supermarket scanner data),
mean of 12 months, in GBP, national only.
United States (US): average price, BLS Average Price Data (U.S. city average), mean of the months with data in the
latest 12 (October 2025 has none), in USD.
Ireland (IE): national average price, CSO table CPM12, mean of 12 months, in EUR.
France (FR): average retail price in metropolitan France, INSEE IPC-PM-2015, mean of 12 months, in EUR, fresh
foods only.
A pack's estimate is price per kg x pack weight (eggs: price per egg x eggs), rounded to 0.05 in the table's currency;
a price the user types always wins.
"""
import json
from functools import lru_cache
from pathlib import Path

PRICES_DIR = Path(__file__).resolve().parents[1] / "data" / "open" / "prices"
COUNTRIES = ("CA", "ES", "FR", "GB", "IE", "US")
STEP_EUR = 0.05


@lru_cache(maxsize=None)
def load_estimates(country):
    """The price table for one country: {country, currency, source, period_from, period_to, built, foods}."""
    if country not in COUNTRIES:
        raise ValueError(f"no estimated prices for country {country!r}; known: {', '.join(COUNTRIES)}")
    with open(PRICES_DIR / f"{country.lower()}.json", encoding="utf-8") as f:
        return json.load(f)


def for_region(table, region):
    """The price table with a region's prices in place of the national ones for the foods it has (those records get
    "region"), plus region and region_name. No region: the table as it is. ValueError for a region it does not have."""
    if region is None:
        return table
    found = table.get("regions", {}).get(region)
    if found is None:
        raise ValueError(f"no estimated prices for region {region!r} in {table['country']}")
    regional = found["foods"]
    foods = {f: ({**rec, **regional[f], "region": region} if f in regional else rec) for f, rec in table["foods"].items()}
    return {**table, "foods": foods, "region": region, "region_name": found["name"]}


def round_price(eur):
    """Rounded to 0.05 (EUR, CAD, GBP, USD), never below 0.05."""
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
