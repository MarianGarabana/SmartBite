"""Estimated average prices for Spain from the MAPA household consumption panel -> data/open/prices/es.json.

Source: Ministerio de Agricultura, Pesca y Alimentacion (MAPA), Panel de consumo alimentario en hogares, monthly
files by region (T.ESPANA columns). Each XLSX has one sheet per month and per product row the value (thousand EUR)
and volume (thousand kg, litres or eggs) bought by households. The price of a food is the volume-weighted average
over the latest 12 months found: sum(value) / sum(volume), per kg, per litre or per egg.

Foods map to rows by hand in data/build/prices-map-es.json (section + row, because row names repeat across groups).
Only exact and close matches get a price. The same files have one column group per region (comunidad autonoma): each
region gets its own price per food, kept only when it has data in as many months as the national price (small
regional samples with gaps gave prices far off, e.g. 0.58x the national one); other foods use the national price. Standard library only: an XLSX file is a zip of XML.

Run from the repo root, with the monthly files in data/raw/mapa/ (gitignored):
  .venv/bin/python data/build/build_prices_es.py
Download (User-Agent "SmartBite" only; macOS system curl trusts the FNMT certificate of mapa.gob.es):
  /usr/bin/curl -A SmartBite -o data/raw/mapa/<name>.xlsx <url from FILES below>
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "mapa"
MAP = ROOT / "data" / "build" / "prices-map-es.json"
PACKS = ROOT / "data" / "open" / "packs" / "packs.json"
OUT = ROOT / "data" / "open" / "prices" / "es.json"

PAGE = "https://www.mapa.gob.es/es/alimentacion/temas/consumo-tendencias/panel-de-consumo-alimentario/series-anuales"
FILES = {
    "2025dic-datos-mensuales-panel-consumo-hogares-ccaa.xlsx":
        "https://www.mapa.gob.es/es/dam/jcr:fbc5c7de-ac34-4dde-aaf5-5c490165ff05/"
        "2025dic-datos-mensuales-panel-consumo-hogares-ccaa-base2021-ok2.2026-09-03-13-12-58.xlsx",
    "2026jul-datos-mensuales-panel-consumo-hogares-ccaa.xlsx":
        "https://www.mapa.gob.es/es/dam/jcr:beaf90f7-fcb3-48fd-94c4-75d5dca90c9f/"
        "2026jul-datos-mensuales-panel-consumo-hogares-ccaa-base2021-ok2.dd098e3c3ac65efedf178641ce3cc2f9.xlsx",
}
SOURCE = "MAPA, Panel de consumo alimentario en hogares"
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre"]
PRICED = ("exact", "close")
SPAIN = "T.ESPAÑA"
# MAPA column name -> ISO 3166-2 code and display name. Ceuta and Melilla have no column (national price).
REGIONS = {
    "ANDALUCÍA": ("ES-AN", "Andalucía"), "ARAGÓN": ("ES-AR", "Aragón"),
    "PRINCIPADO DE ASTURIAS": ("ES-AS", "Asturias"), "ILLES BALEARS": ("ES-IB", "Illes Balears"),
    "CANARIAS": ("ES-CN", "Canarias"), "CANTABRIA": ("ES-CB", "Cantabria"),
    "CASTILLA Y LEÓN": ("ES-CL", "Castilla y León"), "CASTILLA - LA MANCHA": ("ES-CM", "Castilla-La Mancha"),
    "CATALUÑA": ("ES-CT", "Cataluña"), "EXTREMADURA": ("ES-EX", "Extremadura"), "GALICIA": ("ES-GA", "Galicia"),
    "LA RIOJA": ("ES-RI", "La Rioja"), "COMUNIDAD DE MADRID": ("ES-MD", "Comunidad de Madrid"),
    "REGIÓN DE MURCIA": ("ES-MC", "Región de Murcia"), "C. FORAL DE NAVARRA": ("ES-NC", "Navarra"),
    "PAIS VASCO": ("ES-PV", "País Vasco"), "COMUNITAT VALENCIANA": ("ES-VC", "Comunitat Valenciana"),
}
MAX_GAP = 60  # a product row sits at most this many rows under its section row
TOP = ".TOTAL ALIMENTACION"  # first row of each sheet; rows mapped under it have no smaller group
MIN_MONTHS = 6  # fewer months with data: no estimate
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
M = "{%s}" % NS["m"]
LIQUID_RE = re.compile(r"Liquid: 1 ml counted as ([\d.]+) g")


def _col(ref):
    return re.match(r"[A-Z]+", ref).group()


def _sheets(path):
    """[(sheet name, xml path)] and the shared strings of one workbook."""
    z = zipfile.ZipFile(path)
    strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            strings.append("".join(t.text or "" for t in si.iter(M + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = []
    for s in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        out.append((s.get("name"), target if target.startswith("xl/") else "xl/" + target))
    return z, strings, out


def _cells(row, strings):
    out = {}
    for c in row.findall("m:c", NS):
        v = c.find("m:v", NS)
        if v is None:
            inline = c.find("m:is", NS)
            val = "".join(t.text or "" for t in inline.iter(M + "t")) if inline is not None else None
        else:
            val = strings[int(v.text)] if c.get("t") == "s" else v.text
        out[_col(c.get("r"))] = val
    return out


def read_sheet(z, strings, target):
    """{column name: [(row name, value thousand EUR, volume thousand units)]} for T.ESPANA and each region, in sheet
    order. Column A of the region row holds the month, not a region."""
    rows = [_cells(r, strings) for r in ET.fromstring(z.read(target)).iter(M + "row")]
    region = next(i for i, r in enumerate(rows) if SPAIN in r.values())
    header = rows[region + 1]
    order = sorted(header, key=lambda k: (len(k), k))
    cols = {}
    for col, name in rows[region].items():
        if col == "A" or not name:
            continue
        if name != SPAIN and name not in REGIONS:
            raise SystemExit(f"Unknown region column {name!r}: add it to REGIONS.")
        after = order[order.index(col):]
        cols[name] = (next(k for k in after if (header[k] or "").upper().startswith("VALOR")),
                      next(k for k in after if (header[k] or "").upper().startswith("VOLUMEN")))
    out = {name: [] for name in cols}
    for r in rows[region + 2:]:
        name = (r.get("A") or "").strip()
        if name:
            num = lambda k: float(r[k]) if r.get(k) not in (None, "") else None
            for col_name, (value_col, volume_col) in cols.items():
                out[col_name].append((name, num(value_col), num(volume_col)))
    return out


def month_of(sheet_name):
    """(year, month) from a sheet name like 'Julio 2026', else None."""
    m = re.fullmatch(r"\s*([A-Za-z]+)\s+(\d{4})\s*", sheet_name)
    if not m or m.group(1).lower() not in MONTHS:
        return None
    return int(m.group(2)), MONTHS.index(m.group(1).lower()) + 1


def find_row(rows, section, row):
    """Index of the first row named `row` under the (unique) section row. Rows under the top row (TOP) must be
    unique in the sheet, since there is no group to tell them apart."""
    names = [r[0] for r in rows]
    if section == TOP:
        hits = [i for i, n in enumerate(names) if n == row]
        if len(hits) != 1:
            raise LookupError(f"row {row!r} found {len(hits)} times")
        return hits[0]
    hits = [i for i, n in enumerate(names) if n == section]
    if len(hits) != 1:
        raise LookupError(f"section {section!r} found {len(hits)} times")
    start = hits[0]
    for i in range(start, min(start + MAX_GAP, len(names))):
        if names[i] == row:
            return i
    raise LookupError(f"row {row!r} not found under section {section!r}")


def month_value(rows, m):
    """(value, volume) of a mapped food in one sheet: the main row, else its alt rows (older names); None when the
    row is missing or empty that month."""
    for place in [{"section": m["section"], "row": m["row"]}, *m.get("alt", [])]:
        try:
            _name, value, volume = rows[find_row(rows, place["section"], place["row"])]
        except LookupError:
            continue
        return (value, volume) if value and volume else None
    return None


def latest_months(raw=RAW, n=12):
    """{(year, month): (path, sheet)} for the latest n consecutive months in the files; newer files win."""
    found = {}
    for path in sorted(raw.glob("*.xlsx")):
        z, strings, sheets = _sheets(path)
        for name, target in sheets:
            ym = month_of(name)
            if ym:
                found[ym] = (z, strings, target, path.name)
    if not found:
        raise SystemExit(f"No monthly files in {raw}. Download them first (see FILES in this script).")
    months = sorted(found)[-n:]
    if len(months) < n:
        raise SystemExit(f"Only {len(months)} months found, need {n}.")
    for (y1, m1), (y2, m2) in zip(months, months[1:]):
        if (y2 * 12 + m2) - (y1 * 12 + m1) != 1:
            raise SystemExit(f"Months are not consecutive: {y1}-{m1:02d} then {y2}-{m2:02d}.")
    return {ym: found[ym] for ym in months}


def densities(packs_path=PACKS):
    """{food: grams per ml} for liquids, from the notes in packs.json (same density as the pack sizes)."""
    foods = json.loads(packs_path.read_text(encoding="utf-8"))["foods"]
    out = {}
    for food, entry in foods.items():
        m = LIQUID_RE.search(entry.get("note") or "")
        if m:
            out[food] = float(m.group(1))
    return out


def _price(unit, price, density):
    """Price fields of one food: per egg, per kg (liquids also per litre) from value / volume."""
    if unit == "unit":
        return {"price_per_unit_eur": round(price, 4)}
    if unit == "l":
        return {"price_per_kg_eur": round(price / density, 3), "price_per_litre_eur": round(price, 3)}
    return {"price_per_kg_eur": round(price, 3)}


def build(raw=RAW, map_path=MAP, packs_path=PACKS, today=None):
    mapping = json.loads(map_path.read_text(encoding="utf-8"))["foods"]
    months = latest_months(raw)
    dens = densities(packs_path)
    sums = {}  # {column name: {food: [value, volume, months]}}
    for (z, strings, target, _file) in months.values():
        for col_name, rows in read_sheet(z, strings, target).items():
            col_sums = sums.setdefault(col_name, {})
            for food, m in mapping.items():
                if m["match"] not in PRICED:
                    continue
                got = month_value(rows, m)
                s = col_sums.setdefault(food, [0.0, 0.0, 0])
                if got:
                    s[0] += got[0]
                    s[1] += got[1]
                    s[2] += 1
    national = sums[SPAIN]
    short = {f: s[2] for f, s in national.items() if s[2] < MIN_MONTHS}
    if short:
        raise SystemExit(f"Fewer than {MIN_MONTHS} months with data: {short}")
    foods = {}
    for food, (value, volume, n) in sorted(national.items()):
        m = mapping[food]
        rec = {"match": m["match"], "mapa_section": m["section"], "mapa_row": m["row"], "months": n}
        rec.update(_price(m["unit"], value / volume, dens.get(food, 1.0)))
        if m["unit"] == "l":
            rec["grams_per_ml"] = dens.get(food, 1.0)
        foods[food] = rec
    regions = {}
    for col_name in sorted(c for c in sums if c != SPAIN):
        code, name = REGIONS[col_name]
        region_foods = {}
        for food, (value, volume, n) in sorted(sums[col_name].items()):
            if n >= national[food][2] and volume:
                region_foods[food] = {"months": n, **_price(mapping[food]["unit"], value / volume, dens.get(food, 1.0))}
        regions[code] = {"name": name, "mapa_name": col_name, "foods": region_foods}
    (y0, m0), (y1, m1) = min(months), max(months)
    return {
        "country": "ES",
        "currency": "EUR",
        "source": SOURCE,
        "source_url": PAGE,
        "files": sorted({f for (_z, _s, _t, f) in months.values()}),
        "period_from": f"{y0}-{m0:02d}",
        "period_to": f"{y1}-{m1:02d}",
        "months": len(months),
        "built": (today or date.today()).isoformat(),
        "note": ("Average price paid by households in Spain, volume-weighted over the period (total value / total "
                 "volume, T.ESPANA). Averages over brands, pack sizes, shops and promotions; not a shop price. "
                 "Liquids sold per litre are converted to per kg with the density used for the pack sizes. "
                 "regions: the same average per comunidad autonoma (ISO 3166-2 code), only for foods with data in "
                 "as many months as the national price; other foods use the national price."),
        "foods": foods,
        "regions": dict(sorted(regions.items())),
    }


def main():
    doc = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(doc['foods'])} foods, {doc['period_from']} to {doc['period_to']} "
          f"({doc['months']} months)")
    for food, rec in doc["foods"].items():
        if rec["months"] < doc["months"]:
            print(f"  {food}: {rec['months']} months with data")
    for code, region in doc["regions"].items():
        print(f"  {code} {region['name']}: {len(region['foods'])} of {len(doc['foods'])} foods with a regional price")
    return 0


if __name__ == "__main__":
    sys.exit(main())
