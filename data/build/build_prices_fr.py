"""Estimated average prices for France from INSEE -> data/open/prices/fr.json.

Source: INSEE, series IPC-PM-2015 "Prix moyens de vente de détail" (average retail prices in metropolitan France, from
the consumer price index collection): one monthly series per item, in euros for the unit in the series title ("1 kg"
or "pièce"). The price of a food is the plain mean of the monthly prices in the latest 12 months (at least 10),
converted to per kg like Canada's (build_prices_ca.per_kg; a piece uses the SmartBite unit weight).

Foods map to series by IDBANK in data/build/prices-map-fr.json. Only exact and close matches get a price. Standard
library only.

Run from the repo root:
  .venv/bin/python data/build/build_prices_fr.py --download   # saves data/raw/insee/IPC-PM-2015.xml (gitignored)
  .venv/bin/python data/build/build_prices_fr.py              # builds fr.json from the saved file
"""
import argparse
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prices_ca import MIN_MONTHS, MONTHS, PRICED, per_kg  # noqa: E402  same rules as Canada
from build_prices_es import densities  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "insee" / "IPC-PM-2015.xml"
MAP = ROOT / "data" / "build" / "prices-map-fr.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "fr.json"
API = "https://bdm.insee.fr/series/sdmx/data/IPC-PM-2015?startPeriod=2025-01"
SOURCE = "INSEE, IPC-PM-2015, Prix moyens de vente de détail"
PAGE = "https://www.insee.fr/fr/statistiques/series/103157792"  # the dataflow's own page (its SDMX AnnotationURL)
UNITS = {"(1 kg)": "kg", "(pièce)": "each"}  # unit at the end of the series title -> map size


def download(out=RAW):
    req = urllib.request.Request(API, headers={"User-Agent": "SmartBite"})  # third parties get the app name only
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(body)
    print(f"{out.relative_to(ROOT)}: {len(body)} bytes")


def read_series(path=RAW):
    """{IDBANK: {"title", "freq", "stopped", "updated", "prices": {"YYYY-MM": price}}} from the SDMX file. NaN values
    are months without a price and are left out."""
    if not path.exists():
        raise SystemExit(f"No file at {path}. Run with --download first.")
    series = {}
    for el in ET.parse(path).getroot().iter():
        if el.tag.rsplit("}", 1)[-1] != "Series":
            continue
        prices = {}
        for obs in el:
            value = obs.get("OBS_VALUE")
            if obs.tag.rsplit("}", 1)[-1] == "Obs" and value not in (None, "", "NaN"):
                prices[obs.get("TIME_PERIOD")] = float(value)
        series[el.get("IDBANK")] = {"title": el.get("TITLE_FR"), "freq": el.get("FREQ"),
                                    "stopped": el.get("SERIE_ARRETEE") == "TRUE", "updated": el.get("LAST_UPDATE"),
                                    "prices": prices}
    return series


def latest_months(series, n=MONTHS):
    """The n months up to the latest month with a price in any monthly series that is not stopped, oldest first."""
    last = max(m for s in series.values() if s["freq"] == "M" and not s["stopped"] for m in s["prices"])
    y, mo = int(last[:4]), int(last[5:7])
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{mo:02d}")
        y, mo = (y, mo - 1) if mo > 1 else (y - 1, 12)
    return out[::-1]


def unit(title):
    """'kg' or 'each' from the unit at the end of a series title, None for any other unit."""
    m = re.search(r"\([^()]*\)$", title or "")
    return UNITS.get(m.group(0)) if m else None


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    packs = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    dens = densities(packs_path)
    series = read_series(raw)
    months = latest_months(series)
    foods, problems, updated = {}, [], []
    for food, m in sorted(mapping.items()):
        if m["match"] not in PRICED:
            continue
        if food not in packs:
            problems.append(f"{food}: not a SmartBite food")
            continue
        s = series.get(m["idbank"])
        if s is None:
            problems.append(f"{food}: no INSEE series {m['idbank']}")
            continue
        if s["title"] != m["product"] or s["freq"] != "M" or s["stopped"]:
            problems.append(f"{food}: series {m['idbank']} is {s['title']!r} ({s['freq']}, stopped {s['stopped']})")
            continue
        if unit(s["title"]) != m.get("per"):
            problems.append(f"{food}: unit of {s['title']!r} is not per {m.get('per')}")
            continue
        got = [s["prices"][month] for month in months if month in s["prices"]]
        if len(got) < MIN_MONTHS:
            problems.append(f"{food}: {m['idbank']} has {len(got)} of {MONTHS} months")
            continue
        mean = sum(got) / len(got)
        updated.append(s["updated"])
        foods[food] = {"match": m["match"], "insee_idbank": m["idbank"], "insee_series": s["title"],
                       "months": len(got), **per_kg(m, mean, food, packs, dens)}
    if problems:
        raise SystemExit("Fix data/build/prices-map-fr.json:\n  " + "\n  ".join(problems))
    return {
        "country": "FR",
        "currency": "EUR",
        "source": SOURCE,
        "source_url": PAGE,
        "files": [raw.name],
        "insee_updated": max(updated),
        "period_from": months[0],
        "period_to": months[-1],
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average retail price in metropolitan France (INSEE, from the consumer price index collection), the "
                 "mean of the monthly averages over the period. Averages over shops for the unit in the series title "
                 "(1 kg or one piece); not a shop's price. A piece is priced per kg with the SmartBite unit weight. "
                 "Fresh foods only."),
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
