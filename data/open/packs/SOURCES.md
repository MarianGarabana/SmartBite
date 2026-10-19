# Sources

## Open Food Facts

Pack sizes come from Open Food Facts, the free food products database made by its contributors.
Data: Open Food Facts contributors, https://world.openfoodfacts.org, licensed under the
Open Database License v1.0 (see LICENSE in this folder).

- File: `en.openfoodfacts.org.products.csv.gz`, the official CSV export
  (https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz).
- Export date: 2026-10-18 (Last-Modified header: Sun, 18 Oct 2026 12:23:15 GMT).
- Downloaded on 2026-10-19 in one streamed read (1,275,171,186 bytes compressed). The full file was not
  saved: only products whose `countries_tags` contain `en:spain` were kept (354,697 of 4,535,553 rows).
- Fields used: `code`, `product_name`, `generic_name`, `categories_tags`, `quantity`, `product_quantity`,
  `product_quantity_unit`.
- Requests sent `User-Agent: SmartBite` only.

## How the sizes are made

`data/build/build_packs.py` matches products to each food by name (Spanish and English, accents ignored)
and category tags, reads the pack size from `quantity` (multipacks multiplied out, drained weight for
cans and jars when the label gives it, ml to g by the food's density) and keeps the 2 or 3 most common
sizes with their share. Loose fresh produce is not looked up in Open Food Facts: it is bought by the piece,
bunch or head, at a price per kg, with the unit taken from USDA FoodData Central portion weights (below).
Foods where Open Food Facts is thin or wrong use hand-set sizes from `data/build/packs-overrides.json`,
each with its reason. `coverage.md` lists which foods came from where.

## USDA FoodData Central (loose produce)

The weight of one piece, bunch or head of loose produce comes from USDA FoodData Central portion data.
Data: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, https://fdc.nal.usda.gov.
Public domain (CC0 1.0).

- File: `FoodData_Central_sr_legacy_food_csv_2018-04.zip` (SR Legacy), tables `food.csv` and `food_portion.csv`,
  read from `data/raw/usda/` (already downloaded for the nutrition table; no new download).
- One portion per food, usually "1 medium" (e.g. Onions, raw, fdc 170000, 1 medium (2-1/2" dia) = 110 g), or
  "1 head", "1 fruit", "10 beans", "1 sprout". Gram weights are the edible part, like recipe grams.
- Each loose entry in `packs.json` keeps its source as `portion`: `source`, `fdc_id`, `food` (USDA description),
  `description` (the portion) and `gram_weight`, plus `unit` (what you pick in the shop).
- Where USDA has no fitting portion (garlic head, parsley and spring onion bunch, pumpkin), the unit is set by hand
  in `data/build/packs-overrides.json` from the nearest USDA portion, with its reason; the build checks that portion
  against the USDA files.

Rebuild:

```
.venv/bin/python data/build/build_packs.py --download
.venv/bin/python data/build/build_packs.py
```

No prices are included. Users add their own.
