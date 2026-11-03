"""Estimated average prices for the United States from the BLS -> data/open/prices/us.json.

Source: U.S. Bureau of Labor Statistics (BLS), Average Price Data (series APU0000..., U.S. city average): the monthly
average price of a food item for a stated unit (per lb, per dozen eggs, per gallon of milk, per 8 or 12 oz), from the
prices collected for the Consumer Price Index. The price of a food is the plain mean of the monthly prices in the
latest 12 months, converted to per kg (eggs: per egg) like Canada's (build_prices_ca.per_kg). October 2025 has no
data ("Data unavailable due to the 2025 lapse in appropriations"), so most foods average 11 months.

Foods map to series by hand in data/build/prices-map-us.json. Only exact and close matches get a price. The bulk files
on download.bls.gov refuse requests without an email in the User-Agent, so the data comes from the public API v1 (no
key, up to 25 series per request, 25 requests a day), which works with "SmartBite" only.

Run from the repo root:
  .venv/bin/python data/build/build_prices_us.py --download   # saves data/raw/bls/ap.json (gitignored)
  .venv/bin/python data/build/build_prices_us.py              # builds us.json from the saved file
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
RAW = ROOT / "data" / "raw" / "bls" / "ap.json"
MAP = ROOT / "data" / "build" / "prices-map-us.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "us.json"
API = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
SOURCE = "U.S. Bureau of Labor Statistics, Average Price Data (U.S. city average)"
PAGE = "https://www.bls.gov/cpi/factsheets/average-prices.htm"


def download(map_path=MAP, out=RAW, start=None, end=None):
    """Fetch every mapped series for the last two calendar years and save the API's data lists as {series: data}."""
    end = end or date.today().year
    start = start or end - 1
    series = sorted({m["series"] for m in json.loads(map_path.read_text(encoding="utf-8"))["foods"].values()})
    found, messages = {}, []
    for i in range(0, len(series), 25):
        body = json.dumps({"seriesid": series[i:i + 25], "startyear": str(start), "endyear": str(end)}).encode()
        req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json", "User-Agent": "SmartBite"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            reply = json.load(resp)
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


def period(prices):
    """The latest 12 calendar months, ending at the latest month any series has (months with no data still count)."""
    last = max(m for p in prices.values() for m in p)
    y, m = map(int, last.split("-"))
    out = []
    for _ in range(MONTHS):
        out.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    prices, fetched = read_series(raw)
    months = period(prices)
    foods, problems = {}, []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        got = [prices.get(m["series"], {}).get(month) for month in months]
        got = [p for p in got if p is not None]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['series']} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(got) / len(got)
        foods[food] = {"match": m["match"], "bls_series": m["series"], "bls_item": m["product"], "months": len(got),
                       **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-us.json:\n  " + "\n  ".join(problems))
    return {
        "country": "US",
        "currency": "USD",
        "source": SOURCE,
        "source_url": PAGE,
        "files": [raw.name],
        "fetched": fetched,
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average price in U.S. cities (BLS, prices collected for the Consumer Price Index), the mean of the "
                 "monthly averages in the period; October 2025 has no data (2025 lapse in appropriations). Averages over "
                 "brands and stores; not a store's price. Per kg from per lb (453.6 g) or the stated ounces; milk per "
                 "gallon (3.785 l) with the density used for the pack sizes. Prices are in USD (fields named _eur hold "
                 "the table's currency)."),
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
