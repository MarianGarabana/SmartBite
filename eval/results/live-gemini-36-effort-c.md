# Eval run: live-gemini-36-effort-c

Scored 2026-11-03 from `eval/replies/live-gemini-36-effort-c/` against `eval/golden.json`. Code checks only, no model calls.

Score: 74/165 checks passed (44.8%). Skipped: 0. Cases with no reply file: 7 (c01-greek-chicken, c02-salmon-horno, c06-chicken-pasta-exclude, c07-pavo-ligero, c08-egg-breakfast-1, c14-merluza-patatas, c15-bolognese-high-protein).

Recipe attempts: 1 of 8 cases have reruns (1 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 1 pass, 7 fail, 0 skip; on the last: 2 pass, 13 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 8 | 7 | 0 |
| four_ideas | 8 | 7 | 0 |
| idea_names_60 | 8 | 7 | 0 |
| recipe_json | 6 | 9 | 0 |
| recipe_servings | 6 | 9 | 0 |
| keeps_main_ingredients | 6 | 9 | 0 |
| no_excluded_food | 8 | 7 | 0 |
| dry_grams | 8 | 7 | 0 |
| eggs_in_units | 8 | 7 | 0 |
| grams_every_ingredient | 6 | 9 | 0 |
| macros_vs_target | 2 | 13 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c02-salmon-horno | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c03-tuna-no-cook | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c04-ternera-coreana | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c05-vegetarian-lentils | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c06-chicken-pasta-exclude | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c07-pavo-ligero | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c08-egg-breakfast-1 | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c09-garbanzos-6 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c10-pork-stir-fry | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c11-pollo-curry-sin-garbanzos | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c12-turkey-sweet-potato | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c13-tuna-microwave | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c14-merluza-patatas | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c15-bolognese-high-protein | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |

## Failures and skips

- c01-greek-chicken, ideas_json (fail): no reply file
- c01-greek-chicken, four_ideas (fail): no reply file
- c01-greek-chicken, idea_names_60 (fail): no reply file
- c01-greek-chicken, recipe_json (fail): no reply file
- c01-greek-chicken, recipe_servings (fail): no reply file
- c01-greek-chicken, keeps_main_ingredients (fail): no reply file
- c01-greek-chicken, no_excluded_food (fail): no reply file
- c01-greek-chicken, dry_grams (fail): no reply file
- c01-greek-chicken, eggs_in_units (fail): no reply file
- c01-greek-chicken, grams_every_ingredient (fail): no reply file
- c01-greek-chicken, macros_vs_target (fail): no reply file
- c02-salmon-horno, ideas_json (fail): no reply file
- c02-salmon-horno, four_ideas (fail): no reply file
- c02-salmon-horno, idea_names_60 (fail): no reply file
- c02-salmon-horno, recipe_json (fail): no reply file
- c02-salmon-horno, recipe_servings (fail): no reply file
- c02-salmon-horno, keeps_main_ingredients (fail): no reply file
- c02-salmon-horno, no_excluded_food (fail): no reply file
- c02-salmon-horno, dry_grams (fail): no reply file
- c02-salmon-horno, eggs_in_units (fail): no reply file
- c02-salmon-horno, grams_every_ingredient (fail): no reply file
- c02-salmon-horno, macros_vs_target (fail): no reply file
- c03-tuna-no-cook, recipe_json (fail): no reply stored
- c03-tuna-no-cook, recipe_servings (fail): servings None, form asks 3
- c03-tuna-no-cook, keeps_main_ingredients (fail): recipe has no ingredients
- c03-tuna-no-cook, grams_every_ingredient (fail): recipe has no ingredients
- c03-tuna-no-cook, macros_vs_target (fail): recipe has no ingredients
- c04-ternera-coreana, macros_vs_target (fail): protein 40 g vs target 45 g (525 kcal, 40 g protein, 43 g carbs, 21 g fat)
- c05-vegetarian-lentils, macros_vs_target (fail): kcal 502 vs target 450 (502 kcal, 29 g protein, 62 g carbs, 10 g fat)
- c06-chicken-pasta-exclude, ideas_json (fail): no reply file
- c06-chicken-pasta-exclude, four_ideas (fail): no reply file
- c06-chicken-pasta-exclude, idea_names_60 (fail): no reply file
- c06-chicken-pasta-exclude, recipe_json (fail): no reply file
- c06-chicken-pasta-exclude, recipe_servings (fail): no reply file
- c06-chicken-pasta-exclude, keeps_main_ingredients (fail): no reply file
- c06-chicken-pasta-exclude, no_excluded_food (fail): no reply file
- c06-chicken-pasta-exclude, dry_grams (fail): no reply file
- c06-chicken-pasta-exclude, eggs_in_units (fail): no reply file
- c06-chicken-pasta-exclude, grams_every_ingredient (fail): no reply file
- c06-chicken-pasta-exclude, macros_vs_target (fail): no reply file
- c07-pavo-ligero, ideas_json (fail): no reply file
- c07-pavo-ligero, four_ideas (fail): no reply file
- c07-pavo-ligero, idea_names_60 (fail): no reply file
- c07-pavo-ligero, recipe_json (fail): no reply file
- c07-pavo-ligero, recipe_servings (fail): no reply file
- c07-pavo-ligero, keeps_main_ingredients (fail): no reply file
- c07-pavo-ligero, no_excluded_food (fail): no reply file
- c07-pavo-ligero, dry_grams (fail): no reply file
- c07-pavo-ligero, eggs_in_units (fail): no reply file
- c07-pavo-ligero, grams_every_ingredient (fail): no reply file
- c07-pavo-ligero, macros_vs_target (fail): no reply file
- c08-egg-breakfast-1, ideas_json (fail): no reply file
- c08-egg-breakfast-1, four_ideas (fail): no reply file
- c08-egg-breakfast-1, idea_names_60 (fail): no reply file
- c08-egg-breakfast-1, recipe_json (fail): no reply file
- c08-egg-breakfast-1, recipe_servings (fail): no reply file
- c08-egg-breakfast-1, keeps_main_ingredients (fail): no reply file
- c08-egg-breakfast-1, no_excluded_food (fail): no reply file
- c08-egg-breakfast-1, dry_grams (fail): no reply file
- c08-egg-breakfast-1, eggs_in_units (fail): no reply file
- c08-egg-breakfast-1, grams_every_ingredient (fail): no reply file
- c08-egg-breakfast-1, macros_vs_target (fail): no reply file
- c09-garbanzos-6, macros_vs_target (fail): kcal 598 vs target 450 (598 kcal, 36 g protein, 51 g carbs, 23 g fat)
- c11-pollo-curry-sin-garbanzos, macros_vs_target (fail): kcal 502 vs target 450 (502 kcal, 49 g protein, 56 g carbs, 7 g fat)
- c12-turkey-sweet-potato, recipe_json (fail): no reply stored
- c12-turkey-sweet-potato, recipe_servings (fail): servings None, form asks 4
- c12-turkey-sweet-potato, keeps_main_ingredients (fail): recipe has no ingredients
- c12-turkey-sweet-potato, grams_every_ingredient (fail): recipe has no ingredients
- c12-turkey-sweet-potato, macros_vs_target (fail): recipe has no ingredients
- c14-merluza-patatas, ideas_json (fail): no reply file
- c14-merluza-patatas, four_ideas (fail): no reply file
- c14-merluza-patatas, idea_names_60 (fail): no reply file
- c14-merluza-patatas, recipe_json (fail): no reply file
- c14-merluza-patatas, recipe_servings (fail): no reply file
- c14-merluza-patatas, keeps_main_ingredients (fail): no reply file
- c14-merluza-patatas, no_excluded_food (fail): no reply file
- c14-merluza-patatas, dry_grams (fail): no reply file
- c14-merluza-patatas, eggs_in_units (fail): no reply file
- c14-merluza-patatas, grams_every_ingredient (fail): no reply file
- c14-merluza-patatas, macros_vs_target (fail): no reply file
- c15-bolognese-high-protein, ideas_json (fail): no reply file
- c15-bolognese-high-protein, four_ideas (fail): no reply file
- c15-bolognese-high-protein, idea_names_60 (fail): no reply file
- c15-bolognese-high-protein, recipe_json (fail): no reply file
- c15-bolognese-high-protein, recipe_servings (fail): no reply file
- c15-bolognese-high-protein, keeps_main_ingredients (fail): no reply file
- c15-bolognese-high-protein, no_excluded_food (fail): no reply file
- c15-bolognese-high-protein, dry_grams (fail): no reply file
- c15-bolognese-high-protein, eggs_in_units (fail): no reply file
- c15-bolognese-high-protein, grams_every_ingredient (fail): no reply file
- c15-bolognese-high-protein, macros_vs_target (fail): no reply file
