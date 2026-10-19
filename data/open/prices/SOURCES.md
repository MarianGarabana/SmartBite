# Sources

## Spain: MAPA household consumption panel (`es.json`)

Estimated prices for Spain come from the Ministerio de Agricultura, Pesca y Alimentación (MAPA),
**Panel de consumo alimentario en hogares**, monthly data by region, column T.ESPAÑA.
Cite as: "MAPA, Panel de consumo alimentario en hogares, Aug 2025 to Jul 2026."

- Dataset page: https://www.mapa.gob.es/es/alimentacion/temas/consumo-tendencias/panel-de-consumo-alimentario/series-anuales
- Files used (monthly, by region, base 2021), downloaded 2026-10-19 with `User-Agent: SmartBite` only:
  - 2025: https://www.mapa.gob.es/es/dam/jcr:fbc5c7de-ac34-4dde-aaf5-5c490165ff05/2025dic-datos-mensuales-panel-consumo-hogares-ccaa-base2021-ok2.2026-09-03-13-12-58.xlsx
  - 2026 (January to July): https://www.mapa.gob.es/es/dam/jcr:beaf90f7-fcb3-48fd-94c4-75d5dca90c9f/2026jul-datos-mensuales-panel-consumo-hogares-ccaa-base2021-ok2.dd098e3c3ac65efedf178641ce3cc2f9.xlsx
- Period: August 2025 to July 2026 (12 months, the latest available on 2026-10-19).
- Methodology: https://www.mapa.gob.es/es/alimentacion/temas/consumo-tendencias/panel-de-consumo-alimentario/metodologia

### Reuse terms

The MAPA legal notice (https://www.mapa.gob.es/es/atencion-al-ciudadano/aviso-legal) refers to Ley 37/2007,
de 16 de noviembre, sobre reutilización de la información del sector público, and says the information on the
portal may be used without express permission as long as the source is cited, except content where third
parties hold intellectual or industrial property rights. Update-date metadata must be kept: the period and build
date are stored in `es.json` and shown next to every estimated price. This is not a named open licence (not
CC BY); SmartBite cites the source on every estimate and in this file.

### How the prices are made

`data/build/build_prices_es.py` reads the XLSX files (standard library only) from `data/raw/mapa/` (gitignored).
Each food maps by hand to one panel row in `data/build/prices-map-es.json`, keyed by section and row name
because row names repeat across groups (for example BROCOLI fresh and frozen). Match quality:

- **exact**: the same food (50 foods).
- **close**: the same food mixed with its subtypes, for example all canned tuna or all fresh peppers (26 foods).
- **broad**: a parent category that can be far off, for example all spices or all fresh cheeses (55 foods).
- **none**: no row in the panel (8 foods).

Only exact and close matches get a price (76 of 139 foods). Price = sum of value / sum of volume over the 12
months (a volume-weighted average, so seasonal prices of fruit and vegetables even out), per kg, per litre or
per egg. Liquids sold per litre (olive oil, milk, plant drinks, vinegar) are converted to per kg with the same
density the pack sizes use (`data/open/packs/packs.json`).

The Sep to Dec 2025 sheets use older row names for canned fish and yogurt (for example ATUN under
CONS.PESCADO/MOLUSCO instead of CONS.ATUN under T.PESCADO/MARISCO CONSERVADO). The mapping lists these as `alt`
rows; their monthly prices were checked against the new rows and match within a few percent. Kefir has no row
in those sheets and is empty in August 2025, so its price uses 7 months (January to July 2026).

In the app, a pack's estimated price = price per kg x pack weight (eggs: price per egg x eggs per pack), rounded
to 0.05 EUR. A price the user types always wins.

### Caveats

- Averages over all brands, pack sizes, shops, discounters and promotions. A cart of own-brand products can cost
  well under the estimate; premium products cost more.
- National average, not a price from any one shop or region.
- Prices paid by households for home use, not shelf prices.
- Canned and jarred foods: SmartBite pack sizes are drained weight; the panel volume is probably net weight (not
  checked in the methodology). Estimates for these foods can be low.
- Close matches mix subtypes (for example, POLLO FILETES is mostly breast but not only), so the price can be off
  for one specific product.
- Organic products are separate rows in the panel and are not used.
- Rebuild every quarter or so: MAPA publishes monthly with a lag of about 2 to 3 months.

Rebuild:

```
/usr/bin/curl -A SmartBite -o data/raw/mapa/<file>.xlsx <file URL>   # once per new file
.venv/bin/python data/build/build_prices_es.py
```
