"""Estimated average prices for the United States from the BLS and USDA ERS -> data/open/prices/us.json.

Source 1: U.S. Bureau of Labor Statistics (BLS), Average Price Data (series APU0000..., U.S. city average): the monthly
average price of a food item for a stated unit (per lb, per dozen eggs, per gallon of milk, per 8 or 12 oz), from the
prices collected for the Consumer Price Index. The price of a food is the plain mean of the monthly prices in the
latest 12 months, converted to per kg (eggs: per egg) like Canada's (build_prices_ca.per_kg). October 2025 has no
data ("Data unavailable due to the 2025 lapse in appropriations"), so most foods average 11 months.

Source 2, for fruits and vegetables the BLS does not price: USDA Economic Research Service (ERS), Fruit and Vegetable
Prices, the 2023 annual average retail price per lb (Circana scanner data). A 2023 price is moved to the BLS period
with the CPI-U index of its group (fresh fruits, fresh vegetables, canned, frozen, dried; series CUUR0000SEF...):
price x mean index over the months with data in the period / mean index over the 12 months of 2023.

Foods map to a BLS series or an ERS item by hand in data/build/prices-map-us.json. Only exact and close matches get a
price. The bulk files
on download.bls.gov refuse requests without an email in the User-Agent, so the data comes from the public API v1 (no
key, up to 25 series per request, 25 requests a day), which works with "SmartBite" only.

Run from the repo root:
  .venv/bin/python data/build/build_prices_us.py --download   # saves data/raw/bls/ap.json, data/raw/bls/cpi.json
                                                              # and data/raw/ers/*.csv (gitignored)
  .venv/bin/python data/build/build_prices_us.py              # builds us.json from the saved files
"""
import argparse
import csv
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prices_ca import MIN_MONTHS, MONTHS, PRICED, per_kg  # noqa: E402  same rules as Canada
from build_prices_es import densities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "bls" / "ap.json"
CPI_RAW = ROOT / "data" / "raw" / "bls" / "cpi.json"
ERS_DIR = ROOT / "data" / "raw" / "ers"
MAP = ROOT / "data" / "build" / "prices-map-us.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "us.json"
API = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
SOURCE = ("U.S. Bureau of Labor Statistics, Average Price Data (U.S. city average); USDA Economic Research Service, "
          "Fruit and Vegetable Prices (2023)")
PAGE = "https://www.bls.gov/cpi/factsheets/average-prices.htm"
ERS_PAGE = "https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices"
ERS_YEAR = 2023  # the year of the current ERS files (published 2025-12-09)
ERS_FILES = {  # group -> (saved name, URL); the CSVs hold every item of the group
    "fruits": ("all-fruits-average-prices.csv",
               "https://www.ers.usda.gov/media/6210/all-fruits-average-prices-csv-format.csv"),
    "vegetables": ("all-vegetables-average-prices.csv",
                   "https://www.ers.usda.gov/media/6240/all-vegetables-average-prices-csv-format.csv"),
}


def _get(url, body=None):
    headers = {"User-Agent": "SmartBite", **({"Content-Type": "application/json"} if body else {})}
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=60) as resp:
        return resp.read()


def download(map_path=MAP, out=RAW, start=None, end=None):
    """Fetch every mapped BLS series for the last two calendar years (CPI series from ERS_YEAR) and the ERS files."""
    end = end or date.today().year
    foods = json.loads(map_path.read_text(encoding="utf-8"))["foods"].values()
    _download_series(sorted({m["series"] for m in foods if "series" in m}), start or end - 1, end, out)
    _download_series(sorted({m["cpi"] for m in foods if "cpi" in m}), ERS_YEAR, end, CPI_RAW)
    ERS_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in ERS_FILES.values():
        (ERS_DIR / name).write_bytes(_get(url))
        print(f"{(ERS_DIR / name).relative_to(ROOT)}: from {url}")


def _download_series(series, start, end, out):
    """Save the API's data lists of the series as {series: data} (one request per 25 series)."""
    found, messages = {}, []
    for i in range(0, len(series), 25):
        body = json.dumps({"seriesid": series[i:i + 25], "startyear": str(start), "endyear": str(end)}).encode()
        reply = json.loads(_get(API, body))
        if reply.get("status") != "REQUEST_SUCCEEDED":
            raise SystemExit(f"BLS API: {reply.get('status')} {reply.get('message')}")
        messages += reply.get("message") or []
        found.update({s["seriesID"]: s["data"] for s in reply["Results"]["series"]})
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"fetched": date.today().isoformat(), "api": API, "series": found, "messages": messages},
                              indent=1), encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {len(found)} series; {len(messages)} API messages")


def read_series(path=RAW):
    """({series: {"YYYY-MM": price}}, fetched date); "-" values (no data) are skipped."""
    if not path.exists():
        raise SystemExit(f"No file at {path}. Run with --download first.")
    raw = json.loads(path.read_text(encoding="utf-8"))
    prices = {}
    for sid, data in raw["series"].items():
        for d in data:
            if d["period"].startswith("M") and d["period"] != "M13" and d["value"] not in ("-", ""):
                prices.setdefault(sid, {})[f"{d['year']}-{d['period'][1:]}"] = float(d["value"])
    return prices, raw["fetched"]


def read_ers(ers_dir=ERS_DIR):
    """{(group, item, form): (price, unit)} from the saved ERS CSVs."""
    out = {}
    for group, (name, _url) in ERS_FILES.items():
        path = ers_dir / name
        if not path.exists():
            raise SystemExit(f"No file at {path}. Run with --download first.")
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                key = (group, row[group[:-1].capitalize()].strip(), row["Form"].strip())
                out[key] = (float(row["AverageRetailPrice"]), row["AverageRetailPriceUnitOfMeasure"].strip())
    return out


def cpi_factor(cpi, series, months, year=ERS_YEAR):
    """(factor, months used): mean CPI index over the months of the period with data / mean over the 12 months of
    year. Needs MIN_MONTHS in the period and all 12 in the year."""
    got = cpi.get(series, {})
    base = [got[f"{year}-{m:02d}"] for m in range(1, 13) if f"{year}-{m:02d}" in got]
    now = [got[m] for m in months if m in got]
    if len(base) < 12 or len(now) < MIN_MONTHS:
        raise SystemExit(f"CPI {series}: {len(base)} months in {year}, {len(now)} in the period")
    return (sum(now) / len(now)) / (sum(base) / len(base)), len(now)


def period(prices):
    """The latest 12 calendar months, ending at the latest month any series has (months with no data still count)."""
    last = max(m for p in prices.values() for m in p)
    y, m = map(int, last.split("-"))
    out = []
    for _ in range(MONTHS):
        out.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None, cpi_raw=CPI_RAW, ers_dir=ERS_DIR):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    prices, fetched = read_series(raw)
    months = period(prices)
    ers = cpi = None
    foods, problems = {}, []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        if "ers" in m:
            if ers is None:
                ers, (cpi, _) = read_ers(ers_dir), read_series(cpi_raw)
            e = m["ers"]
            row = ers.get((e["group"], e["item"], e["form"]))
            if row is None or row[1] != "per pound":
                problems.append(f"{food}: ERS {e} {'not found' if row is None else 'is ' + row[1]}")
                continue
            factor, n = cpi_factor(cpi, m["cpi"], months)
            foods[food] = {"match": m["match"], "source": "USDA ERS", "ers_item": e["item"], "ers_form": e["form"],
                           "ers_year": ERS_YEAR, "ers_price_per_lb": round(row[0], 4), "cpi_series": m["cpi"],
                           "cpi_factor": round(factor, 4), "months": n,
                           **per_kg(m, row[0] * factor, food, packs, dens)}
            continue
        got = [prices.get(m["series"], {}).get(month) for month in months]
        got = [p for p in got if p is not None]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['series']} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(got) / len(got)
        foods[food] = {"match": m["match"], "source": "BLS", "bls_series": m["series"], "bls_item": m["product"], "months": len(got),
                       **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-us.json:\n  " + "\n  ".join(problems))
    return {
        "country": "US",
        "currency": "USD",
        "source": SOURCE,
        "source_url": PAGE,
        "ers_source_url": ERS_PAGE,
        "files": [raw.name, cpi_raw.name, *sorted(name for name, _url in ERS_FILES.values())],
        "fetched": fetched,
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average price in U.S. cities (BLS, prices collected for the Consumer Price Index), the mean of the "
                 "monthly averages in the period; October 2025 has no data (2025 lapse in appropriations). Averages over "
                 "brands and stores; not a store's price. Per kg from per lb (453.6 g) or the stated ounces; milk per "
                 "gallon (3.785 l) with the density used for the pack sizes. Prices are in USD (fields named _eur hold "
                 "the table's currency). Foods with source USDA ERS (fruits and vegetables the BLS does not price): "
                 "the ERS 2023 average retail price per lb (Circana scanner data) times cpi_factor, the CPI-U index of "
                 "the food's group averaged over the period divided by its 2023 average."),
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
    ers = sum(1 for r in out["foods"].values() if r["source"] == "USDA ERS")
    print(f"{OUT.relative_to(ROOT)}: {len(out['foods'])} foods ({len(out['foods']) - ers} BLS, {ers} USDA ERS), "
          f"{out['period_from']} to {out['period_to']}")


if __name__ == "__main__":
    main()
