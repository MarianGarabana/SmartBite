"""Estimated average prices for Canada from Statistics Canada -> data/open/prices/ca.json.

Source: Statistics Canada, Table 18-10-0245-01, Monthly average retail prices for selected products (GEO "Canada").
Each row is one product and month: the average price paid in Canadian dollars, from grocery retailers' transaction
data (table note 1), for a stated size (per kilogram, a pack
weight or volume, one piece, or a dozen eggs). The price of a food is the plain mean of the latest 12 monthly prices
(the table has no volumes to weight by), converted to per kg (eggs: per egg).

Foods map to products by hand in data/build/prices-map-ca.json. Only exact and close matches get a price. Standard
library only.

Run from the repo root, with the table in data/raw/statcan/ (gitignored):
  .venv/bin/python data/build/build_prices_ca.py
Download (User-Agent "SmartBite" only):
  curl -A SmartBite -o data/raw/statcan/18100245-eng.zip https://www150.statcan.gc.ca/n1/tbl/csv/18100245-eng.zip
  unzip -o data/raw/statcan/18100245-eng.zip -d data/raw/statcan
"""
import csv
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prices_es import densities  # noqa: E402  same liquid densities as the pack sizes

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "statcan" / "18100245.csv"
MAP = ROOT / "data" / "build" / "prices-map-ca.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "ca.json"
SOURCE = "Statistics Canada, Table 18-10-0245-01, Monthly average retail prices for selected products"
PAGE = "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501"
GEO = "Canada"
PRICED = ("exact", "close")
MONTHS = 12
MIN_MONTHS = 10  # a product with a few months missing in the period still gets the mean of the months it has


def read_table(path=RAW):
    """{product: {"YYYY-MM": (price, vector)}} for GEO Canada, rows with a value only."""
    if not path.exists():
        raise SystemExit(f"No table at {path}. Download it first (see the top of this script).")
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["GEO"] != GEO or row["UOM"] != "Dollars" or not row["VALUE"]:
                continue
            out.setdefault(row["Products"], {})[row["REF_DATE"]] = (float(row["VALUE"]), row["VECTOR"])
    return out


def latest_months(table, n=MONTHS):
    """The latest n months found in the table, oldest first."""
    months = sorted({m for prices in table.values() for m in prices})
    if len(months) < n:
        raise SystemExit(f"Only {len(months)} months in the table, need {n}.")
    return months[-n:]


def per_kg(m, price, food, packs, dens):
    """Price fields for one monthly mean price of the mapped size."""
    if "eggs" in m:
        return {"price_per_unit_eur": round(price / m["eggs"], 4)}
    if m.get("per") == "kg":
        return {"price_per_kg_eur": round(price, 3)}
    if m.get("per") == "each":
        unit_g = packs[food]["default_grams"]
        return {"price_per_kg_eur": round(price / unit_g * 1000, 3), "price_each": round(price, 3), "unit_grams": unit_g}
    if "litres" in m:
        litre = price / m["litres"]
        d = dens.get(food, 1.0)
        return {"price_per_kg_eur": round(litre / d, 3), "price_per_litre_eur": round(litre, 3), "grams_per_ml": d}
    return {"price_per_kg_eur": round(price / m["grams"] * 1000, 3)}


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    table = read_table(raw)
    months = latest_months(table)
    foods, problems = {}, []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        found = [table.get(m["product"], {}).get(month) for month in months]
        got = [p for p in found if p]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['product']!r} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(p for p, _v in got) / len(got)
        foods[food] = {"match": m["match"], "statcan_product": m["product"].strip(), "statcan_vector": got[-1][1],
                       "months": len(got), **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-ca.json:\n  " + "\n  ".join(problems))
    return {
        "country": "CA",
        "currency": "CAD",
        "source": SOURCE,
        "source_url": PAGE,
        "files": [raw.name],
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average price paid in Canada (Statistics Canada, from grocery retailers' transaction data), the mean "
                 "of the monthly averages over the period. Averages over brands and stores for the size Statistics "
                 "Canada prices; not a shop's price. Per kg from "
                 "that size: canned food in ml read as grams, liquids per litre with the density used for the pack sizes, "
                 "loose pieces with the SmartBite unit weight. Prices are in CAD (fields named _eur hold the table's "
                 "currency, as for every country)."),
        "foods": foods,
    }


def main():
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out['foods'])} foods, {out['period_from']} to {out['period_to']}")


if __name__ == "__main__":
    main()
