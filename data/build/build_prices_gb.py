"""Estimated average prices for the United Kingdom from the ONS -> data/open/prices/gb.json.

Source: Office for National Statistics (ONS), Shopping Prices Comparison Tool data download, sheet "Average price":
one row per item and month, the average price in pounds for a stated size (WEIGHT_SIZE: "1000 g", "400 g", "each",
"12 pack", "1136 ml"). ONS computes it from the price quotes of the monthly consumer prices collection and, for
groceries, supermarket scanner data (checkout and online sales). The price of a food is the plain mean of the latest
12 monthly prices, converted to per kg (eggs: per egg) like Canada's (build_prices_ca.per_kg).

Foods map to items by hand in data/build/prices-map-gb.json; the build stops when a mapped size no longer matches the
sheet's WEIGHT_SIZE. Only exact and close matches get a price. Standard library only: an XLSX file is a zip of XML.

Run from the repo root, with the file in data/raw/ons/ (gitignored):
  .venv/bin/python data/build/build_prices_gb.py
Download (User-Agent "SmartBite" only; the ONS publishes the file through its GitHub repo):
  curl -L -A SmartBite -o data/raw/ons/datadownload.xlsx https://github.com/onsdigital/cpi-items-actions/raw/main/datadownload.xlsx
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prices_ca import MIN_MONTHS, MONTHS, PRICED, per_kg  # noqa: E402  same rules as Canada
from build_prices_es import densities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "ons" / "datadownload.xlsx"
MAP = ROOT / "data" / "build" / "prices-map-gb.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "gb.json"
SOURCE = "ONS, Shopping prices comparison tool (average prices)"
PAGE = "https://www.ons.gov.uk/economy/inflationandpriceindices/articles/shoppingpricescomparisontool/latest"
SHEET = "Average price"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def _sheet_rows(path, name):
    """Rows of one sheet as lists of cell text (shared strings resolved)."""
    with zipfile.ZipFile(path) as z:
        strings = ["".join(si.itertext()) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        book = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid = next(s.get(f"{{{NS['r']}}}id") for s in book.iter(f"{{{NS['m']}}}sheet") if s.get("name") == name)
        target = next(r.get("Target") for r in rels if r.get("Id") == rid)
        root = ET.fromstring(z.read("xl/" + target.lstrip("/").removeprefix("xl/")))
    for row in root.iter(f"{{{NS['m']}}}row"):
        cells = []
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            cells.append(None if v is None else strings[int(v.text)] if c.get("t") == "s" else v.text)
        yield cells


def read_table(path=RAW):
    """({item: {"YYYY-MM": price}}, {item: WEIGHT_SIZE}) for rows with a price ("-" means none)."""
    if not path.exists():
        raise SystemExit(f"No file at {path}. Download it first (see the top of this script).")
    rows = _sheet_rows(path, SHEET)
    head = next(rows)
    col = {name: head.index(name) for name in ("INDEX_DATE", "ID_DESC", "WEIGHT_SIZE", "AVERAGE_PRICE")}
    prices, sizes = {}, {}
    for r in rows:
        item, value = r[col["ID_DESC"]], r[col["AVERAGE_PRICE"]]
        if not item:
            continue
        sizes[item] = (r[col["WEIGHT_SIZE"]] or "").strip()
        if value in (None, "", "-"):
            continue
        prices.setdefault(item, {})[r[col["INDEX_DATE"]][:7]] = float(value)
    return prices, sizes


def size_text(m):
    """The WEIGHT_SIZE the map's size stands for."""
    if m.get("per") == "kg":
        return "1000 g"
    if m.get("per") == "each":
        return "each"
    if "eggs" in m:
        return f"{m['eggs']} pack"
    if "litres" in m:
        return f"{round(m['litres'] * 1000)} ml"
    return f"{m['grams']} g"


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    prices, sizes = read_table(raw)
    months = sorted({m for p in prices.values() for m in p})[-MONTHS:]
    if len(months) < MONTHS:
        raise SystemExit(f"Only {len(months)} months in the file, need {MONTHS}.")
    foods, problems = {}, []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        if re.sub(r"\s+", " ", sizes.get(m["product"], "")) != size_text(m):
            problems.append(f"{food}: {m['product']!r} is sold as {sizes.get(m['product'])!r}, the map says {size_text(m)!r}")
            continue
        got = [prices.get(m["product"], {}).get(month) for month in months]
        got = [p for p in got if p is not None]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['product']!r} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(got) / len(got)
        foods[food] = {"match": m["match"], "ons_item": m["product"], "ons_size": sizes[m["product"]], "months": len(got),
                       **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-gb.json:\n  " + "\n  ".join(problems))
    return {
        "country": "GB",
        "currency": "GBP",
        "source": SOURCE,
        "source_url": PAGE,
        "files": [raw.name],
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average price in the United Kingdom (ONS: consumer prices collection quotes and, for groceries, "
                 "supermarket scanner data; official statistics in development), the mean of the monthly averages over "
                 "the period. Averages over brands and shops for the size ONS prices; not a shop's price. Per kg from "
                 "that size: liquids per litre with the density used for the pack sizes, loose pieces with the "
                 "SmartBite unit weight. Prices are in GBP (fields named _eur hold the table's currency)."),
        "foods": foods,
    }


def main():
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out['foods'])} foods, {out['period_from']} to {out['period_to']}")


if __name__ == "__main__":
    main()
