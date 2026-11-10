# Eval run: live-gemini-36-effort

Scored 2026-11-01 from `eval/replies/live-gemini-36-effort/` against `eval/golden.json`. Code checks only, no model calls.

Score: 74/165 checks passed (44.8%). Skipped: 0. Cases with no reply file: 6 (c05-vegetarian-lentils, c11-pollo-curry-sin-garbanzos, c12-turkey-sweet-potato, c13-tuna-microwave, c14-merluza-patatas, c15-bolognese-high-protein).

Recipe attempts: 3 of 9 cases have reruns (3 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 4 pass, 5 fail, 0 skip; on the last: 4 pass, 11 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 9 | 6 | 0 |
| four_ideas | 9 | 6 | 0 |
| idea_names_60 | 9 | 6 | 0 |
| recipe_json | 4 | 11 | 0 |
| recipe_servings | 4 | 11 | 0 |
| keeps_main_ingredients | 4 | 11 | 0 |
| no_excluded_food | 9 | 6 | 0 |
| dry_grams | 9 | 6 | 0 |
| eggs_in_units | 9 | 6 | 0 |
| grams_every_ingredient | 4 | 11 | 0 |
| macros_vs_target | 4 | 11 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c02-salmon-horno | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c03-tuna-no-cook | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c04-ternera-coreana | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c05-vegetarian-lentils | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c06-chicken-pasta-exclude | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c07-pavo-ligero | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c08-egg-breakfast-1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c09-garbanzos-6 | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c10-pork-stir-fry | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c11-pollo-curry-sin-garbanzos | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c12-turkey-sweet-potato | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c13-tuna-microwave | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c14-merluza-patatas | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c15-bolognese-high-protein | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |

## Failures and skips

- c01-greek-chicken, recipe_json (fail): no reply stored
- c01-greek-chicken, recipe_servings (fail): servings None, form asks 4
- c01-greek-chicken, keeps_main_ingredients (fail): recipe has no ingredients
- c01-greek-chicken, grams_every_ingredient (fail): recipe has no ingredients
- c01-greek-chicken, macros_vs_target (fail): recipe has no ingredients
- c03-tuna-no-cook, recipe_json (fail): no reply stored
- c03-tuna-no-cook, recipe_servings (fail): servings None, form asks 3
- c03-tuna-no-cook, keeps_main_ingredients (fail): recipe has no ingredients
- c03-tuna-no-cook, grams_every_ingredient (fail): recipe has no ingredients
- c03-tuna-no-cook, macros_vs_target (fail): recipe has no ingredients
- c04-ternera-coreana, recipe_json (fail): no reply stored
- c04-ternera-coreana, recipe_servings (fail): servings None, form asks 5
- c04-ternera-coreana, keeps_main_ingredients (fail): recipe has no ingredients
- c04-ternera-coreana, grams_every_ingredient (fail): recipe has no ingredients
- c04-ternera-coreana, macros_vs_target (fail): recipe has no ingredients
- c05-vegetarian-lentils, ideas_json (fail): no reply file
- c05-vegetarian-lentils, four_ideas (fail): no reply file
- c05-vegetarian-lentils, idea_names_60 (fail): no reply file
- c05-vegetarian-lentils, recipe_json (fail): no reply file
- c05-vegetarian-lentils, recipe_servings (fail): no reply file
- c05-vegetarian-lentils, keeps_main_ingredients (fail): no reply file
- c05-vegetarian-lentils, no_excluded_food (fail): no reply file
- c05-vegetarian-lentils, dry_grams (fail): no reply file
- c05-vegetarian-lentils, eggs_in_units (fail): no reply file
- c05-vegetarian-lentils, grams_every_ingredient (fail): no reply file
- c05-vegetarian-lentils, macros_vs_target (fail): no reply file
- c09-garbanzos-6, recipe_json (fail): no reply stored
- c09-garbanzos-6, recipe_servings (fail): servings None, form asks 6
- c09-garbanzos-6, keeps_main_ingredients (fail): recipe has no ingredients
- c09-garbanzos-6, grams_every_ingredient (fail): recipe has no ingredients
- c09-garbanzos-6, macros_vs_target (fail): recipe has no ingredients
- c10-pork-stir-fry, recipe_json (fail): no reply stored
- c10-pork-stir-fry, recipe_servings (fail): servings None, form asks 3
- c10-pork-stir-fry, keeps_main_ingredients (fail): recipe has no ingredients
- c10-pork-stir-fry, grams_every_ingredient (fail): recipe has no ingredients
- c10-pork-stir-fry, macros_vs_target (fail): recipe has no ingredients
- c11-pollo-curry-sin-garbanzos, ideas_json (fail): no reply file
- c11-pollo-curry-sin-garbanzos, four_ideas (fail): no reply file
- c11-pollo-curry-sin-garbanzos, idea_names_60 (fail): no reply file
- c11-pollo-curry-sin-garbanzos, recipe_json (fail): no reply file
- c11-pollo-curry-sin-garbanzos, recipe_servings (fail): no reply file
- c11-pollo-curry-sin-garbanzos, keeps_main_ingredients (fail): no reply file
- c11-pollo-curry-sin-garbanzos, no_excluded_food (fail): no reply file
- c11-pollo-curry-sin-garbanzos, dry_grams (fail): no reply file
- c11-pollo-curry-sin-garbanzos, eggs_in_units (fail): no reply file
- c11-pollo-curry-sin-garbanzos, grams_every_ingredient (fail): no reply file
- c11-pollo-curry-sin-garbanzos, macros_vs_target (fail): no reply file
- c12-turkey-sweet-potato, ideas_json (fail): no reply file
- c12-turkey-sweet-potato, four_ideas (fail): no reply file
- c12-turkey-sweet-potato, idea_names_60 (fail): no reply file
- c12-turkey-sweet-potato, recipe_json (fail): no reply file
- c12-turkey-sweet-potato, recipe_servings (fail): no reply file
- c12-turkey-sweet-potato, keeps_main_ingredients (fail): no reply file
- c12-turkey-sweet-potato, no_excluded_food (fail): no reply file
- c12-turkey-sweet-potato, dry_grams (fail): no reply file
- c12-turkey-sweet-potato, eggs_in_units (fail): no reply file
- c12-turkey-sweet-potato, grams_every_ingredient (fail): no reply file
- c12-turkey-sweet-potato, macros_vs_target (fail): no reply file
- c13-tuna-microwave, ideas_json (fail): no reply file
- c13-tuna-microwave, four_ideas (fail): no reply file
- c13-tuna-microwave, idea_names_60 (fail): no reply file
- c13-tuna-microwave, recipe_json (fail): no reply file
- c13-tuna-microwave, recipe_servings (fail): no reply file
- c13-tuna-microwave, keeps_main_ingredients (fail): no reply file
- c13-tuna-microwave, no_excluded_food (fail): no reply file
- c13-tuna-microwave, dry_grams (fail): no reply file
- c13-tuna-microwave, eggs_in_units (fail): no reply file
- c13-tuna-microwave, grams_every_ingredient (fail): no reply file
- c13-tuna-microwave, macros_vs_target (fail): no reply file
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
