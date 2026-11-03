"""Estimated average prices for Ireland from the CSO -> data/open/prices/ie.json.

Source: Central Statistics Office (CSO), Ireland, table CPM12 "National Average Price": one value per item and month,
the national average price in euros for the size in the item's label ("per kg", "per 500g", "per half dozen",
"2.5 kg"). The price of a food is the plain mean of the latest 12 monthly prices, converted to per kg (eggs: per egg)
like Canada's (build_prices_ca.per_kg).

Foods map to items by hand in data/build/prices-map-ie.json. Only exact and close matches get a price. Standard
library only.

Run from the repo root:
  .venv/bin/python data/build/build_prices_ie.py --download   # saves data/raw/cso/CPM12.json (gitignored)
  .venv/bin/python data/build/build_prices_ie.py              # builds ie.json from the saved file
"""
import argparse
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prices_ca import MIN_MONTHS, MONTHS, PRICED, per_kg  # noqa: E402  same rules as Canada
from build_prices_es import densities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "cso" / "CPM12.json"
MAP = ROOT / "data" / "build" / "prices-map-ie.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "ie.json"
API = "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/CPM12/JSON-stat/2.0/en"
SOURCE = "CSO, table CPM12, National Average Price"
PAGE = "https://data.cso.ie/table/CPM12"
TIME = "TLIST(M1)"


def download(out=RAW):
    req = urllib.request.Request(API, headers={"User-Agent": "SmartBite"})  # third parties get the app name only
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(body)
    print(f"{out.relative_to(ROOT)}: {len(body)} bytes")


def read_table(path=RAW):
    """({item label: {"YYYY-MM": price}}, updated) from the JSON-stat file (value index = time x items + item)."""
    if not path.exists():
        raise SystemExit(f"No file at {path}. Run with --download first.")
    d = json.loads(path.read_text(encoding="utf-8"))
    times = list(d["dimension"][TIME]["category"]["index"])
    item_dim = next(k for k in d["id"] if k not in ("STATISTIC", TIME))
    cat = d["dimension"][item_dim]["category"]
    items = list(cat["index"])
    if d["id"] != ["STATISTIC", TIME, item_dim] or d["size"] != [1, len(times), len(items)]:
        raise SystemExit(f"Unexpected CPM12 layout: {d['id']} {d['size']}")
    prices = {}
    for ti, t in enumerate(times):
        month = f"{t[:4]}-{t[4:]}"
        for ii, code in enumerate(items):
            v = d["value"][ti * len(items) + ii]
            if v is not None:
                prices.setdefault(cat["label"][code], {})[month] = float(v)
    return prices, d.get("updated"), [f"{t[:4]}-{t[4:]}" for t in times]


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    prices, updated, times = read_table(raw)
    months = times[-MONTHS:]
    foods, problems = {}, []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        if m["product"] not in prices:
            problems.append(f"{food}: no CSO item {m['product']!r}")
            continue
        got = [prices[m["product"]].get(month) for month in months]
        got = [p for p in got if p is not None]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['product']!r} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(got) / len(got)
        foods[food] = {"match": m["match"], "cso_item": m["product"], "months": len(got),
                       **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-ie.json:\n  " + "\n  ".join(problems))
    return {
        "country": "IE",
        "currency": "EUR",
        "source": SOURCE,
        "source_url": PAGE,
        "files": [raw.name],
        "cso_updated": updated,
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("National average price in Ireland (CSO, from the Consumer Price Index collection), the mean of the "
                 "monthly averages over the period. Averages over brands and shops for the size in the item's label; "
                 "not a shop's price. Per kg from that size; milk per litre with the density used for the pack sizes."),
        "foods": foods,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    if ap.parse_args().download:
        download()
        return
    out = build()
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out['foods'])} foods, {out['period_from']} to {out['period_to']}")


if __name__ == "__main__":
    main()
