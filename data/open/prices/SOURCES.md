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

### Regions

The same files have one column group per comunidad autónoma (17; Ceuta and Melilla have no column). `es.json`
`regions` holds a price per food for each one, keyed by ISO 3166-2 code (for example `ES-MD`), made the same way
from that region's value and volume columns. A regional price is kept only when the region has data in as many
months as the national price for that food: regional samples are small, and the prices from months with gaps were
the furthest off (for example 0.58x and 1.78x the national price). With that rule each region has a price for 63
(La Rioja) to 76 of the 76 foods, between 0.72x and 1.66x the national price. A food with no regional price uses
the national one, and the line says which one priced it.

In the app, a pack's estimated price = price per kg x pack weight (eggs: price per egg x eggs per pack), rounded
to 0.05 EUR. A price the user types always wins.

### Caveats

- Averages over all brands, pack sizes, shops, discounters and promotions. A cart of own-brand products can cost
  well under the estimate; premium products cost more.
- National or regional average, not a price from any one shop. Regional prices rest on smaller samples.
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

## Canada: Statistics Canada monthly average retail prices (`ca.json`)

Estimated prices for Canada come from Statistics Canada, **Table 18-10-0245-01, Monthly average retail prices for
selected products**, GEO "Canada".
Cite as: "Statistics Canada. Table 18-10-0245-01 Monthly average retail prices for selected products, September 2025
to August 2026."

- Table page: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501
- File used: `18100245-eng.zip` (CSV `18100245.csv`), from https://www150.statcan.gc.ca/n1/tbl/csv/18100245-eng.zip,
  found through the Web Data Service (`getFullTableDownloadCSV/18100245/en`), downloaded 2026-11-03 with
  `User-Agent: SmartBite` only (Last-Modified: 7 Oct 2026).
- Period: September 2025 to August 2026 (12 months, the latest available on 2026-11-03).
- Method: table note 1 says the averages are "derived using transaction data from Canadian grocery retailers".
  Methodological supplement: https://www150.statcan.gc.ca/n1/pub/62f0014m/62f0014m2022007-eng.htm

### Reuse terms

Statistics Canada data are released under the Statistics Canada Open Licence
(https://www.statcan.gc.ca/en/reference/licence), which allows copying, adapting and redistributing the data,
commercially or not, with an acknowledgement of the source. SmartBite adapts the data (per kg prices, 12-month
means), so: Adapted from Statistics Canada, Table 18-10-0245-01, Monthly average retail prices for selected products.
This does not constitute an endorsement by Statistics Canada of this product.

### How the prices are made

`data/build/build_prices_ca.py` reads the CSV (standard library only) from `data/raw/statcan/` (gitignored). Each
food maps by hand to one product in `data/build/prices-map-ca.json`, with its size: per kilogram, a pack weight
(canned food in ml read as grams), litres (per kg with the density used for the pack sizes), one piece (per kg with
the SmartBite unit weight of that food, so one SmartBite lemon costs one Statistics Canada lemon) or a dozen eggs
(per egg). The table has no volumes, so the price is the plain mean of the 12 monthly averages. Match quality:
29 exact and 24 close matches get a price (53 foods); broccoli, frozen mixed berries, frozen salmon are broad matches kept
only to say why they have none. Foods with no product (for example spices, feta, skyr, walnuts) have no estimate.

### Caveats

- Averages over all brands and stores for the size Statistics Canada prices (for example rice in 2 kg bags, carrots
  in 1.36 kg bags; potatoes and onions use the bag price, not the loose one, which costs far more per kg); a different size or brand can cost more or less per kg.
- National average only; prices differ by province (the table has them, SmartBite does not use them yet).
- Canned food: SmartBite pack sizes are drained weight and the can sizes are net volume, so estimates for canned
  beans, corn and tomatoes can be low.
- Close matches mix subtypes (all olive oil for extra virgin, all yogurt for 0% plain, all sweet peppers for red
  and green).
- Table note 1: average prices may not be fully comparable from one month to the next; data are subject to revision.
- Rebuild every quarter or so: Statistics Canada publishes monthly with a lag of about 2 months.

Rebuild:

```
curl -A SmartBite -o data/raw/statcan/18100245-eng.zip https://www150.statcan.gc.ca/n1/tbl/csv/18100245-eng.zip
unzip -o data/raw/statcan/18100245-eng.zip -d data/raw/statcan
.venv/bin/python data/build/build_prices_ca.py
```
