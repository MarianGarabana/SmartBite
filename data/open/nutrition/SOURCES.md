# Nutrition sources

`per-100g.json` gives kcal, protein, carbs and fat per 100 g edible portion for each food, plus fiber and 10 micronutrients when the source has them (iron, calcium, potassium, magnesium, zinc, vitamins A, C, D and B12, folate). A missing fiber or micronutrient key means the source has no value: unknown, not 0. Every record names its source, the source id and the source food name. It is built by `data/build/build_nutrition.py` from the raw files below and the hand-picked map in `data/build/nutrition-map.json`. Matches that are judgment calls are listed in `review.md`.

## Ciqual 2025 (ANSES)

- What: French food composition table, 3,484 foods. Used first for every food, because it covers European foods and products.
- Version: Ciqual 2025, XML files dated 2025-11-03 (`alim_2025_11_03.xml`, `compo_2025_11_03.xml`).
- Download: Recherche Data Gouv, DOI [10.57745/RDMHWY](https://doi.org/10.57745/RDMHWY). Also on [ciqual.anses.fr](https://ciqual.anses.fr).
- License: Licence Ouverte / Open Licence 2.0 (Etalab 2.0), <https://www.etalab.gouv.fr/licence-ouverte-open-licence/>. Reuse is free, including commercial reuse, with attribution.
- Citation: Anses. 2025. Table de composition nutritionnelle des aliments Ciqual. https://doi.org/10.57745/RDMHWY
- Fields used: energy, Regulation EU No 1169/2011 (kcal/100 g, code 328); protein, N x Jones factor (25000); carbohydrate (31000); fat (40000).
- Fiber and micronutrients: fiber (34100, g); iron (10260), calcium (10200), potassium (10190), magnesium (10120), zinc (10300), vitamin C (55100), all mg; vitamin A as retinol equivalents (51104, µg; never retinol or beta-carotene alone); vitamin D (52100, µg); vitamin B12 (56600, µg); folate as total folates (56700, µg), or as dietary folate equivalents (56702) for foods that have only that one (Ciqual gives one or the other; for foods without added folic acid they are the same).
- Values: "traces" and "< x" are read as 0, for every field (below the detection limit, so a nutrient is never overstated). For the four macros, "-" (no value) is listed under `missing` and counted as 0. For fiber and micronutrients, "-" or no row means the key is left out (unknown).

## USDA FoodData Central

- What: US food composition data. Used only where Ciqual has no good match (for example ground turkey, cottage cheese, edamame, dry textured soy).
- Datasets: Foundation Foods (April 2026 release, `FoodData_Central_foundation_food_csv_2026-04-30.zip`) and SR Legacy (April 2018, `FoodData_Central_sr_legacy_food_csv_2018-04.zip`). Each USDA record says which one in `usda_dataset`.
- Download: <https://fdc.nal.usda.gov/download-datasets/>
- License: public domain, CC0 1.0 Universal, <https://creativecommons.org/publicdomain/zero/1.0/>. No permission needed.
- Citation (suggested by USDA): U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. 2019-2026. fdc.nal.usda.gov.
- Fields used: Energy (nutrient 1008; if absent, Atwater Specific 2048, then Atwater General 2047); Protein (1003); Carbohydrate, by difference (1005; if absent, by summation 1050); Total lipid (1004; if absent, NLEA total fat 1085).
- Fiber and micronutrients: fiber (1079); iron (1089), calcium (1087), potassium (1092), magnesium (1090), zinc (1095), vitamin C (1162), all mg; vitamin A as RAE (1106, µg); vitamin D, D2 + D3 (1114, µg, not the IU field); vitamin B12 (1178, µg); folate, total (1177, µg). A nutrient with no row for the food is left out (unknown).

## Differences between the two

- Carbs: Ciqual carbohydrate excludes fiber. USDA carbohydrate by difference includes fiber. For fiber-rich USDA foods (oats, defatted soy flour) carbs read higher than a European label.
- Energy: Ciqual uses EU label factors (fiber counted at 2 kcal/g). USDA energy uses Atwater factors. The gap is small for most foods.

## Branded products

- Open Food Facts, looked up by barcode at run time (`smartbite_engine/nutrition.py`). Data is ODbL 1.0. Nothing from Open Food Facts is stored in this folder. Fiber comes from `fiber_100g`; micronutrients from the `_100g` fields (Open Food Facts stores them in g per 100 g; the engine converts to mg or µg). A field the product does not have stays unknown.

## What is not used

- BEDCA (the Spanish food composition database, AESAN) is not used, and no BEDCA value is in this repo. Its terms do not allow non-personal electronic use without written permission.
- No store data: no supermarket labels, product names, prices or barcodes collected from store pages.
- Requests for the raw files sent only `User-Agent: SmartBite`. One download per file.
