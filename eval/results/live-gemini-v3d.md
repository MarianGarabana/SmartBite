# Eval run: live-gemini-v3d

Scored 2026-10-23 from `eval/replies/live-gemini-v3d/` against `eval/golden.json`. Code checks only, no model calls.

Score: 29/165 checks passed (17.6%). Skipped: 0. Cases with no reply file: 11 (c01-greek-chicken, c02-salmon-horno, c03-tuna-no-cook, c04-ternera-coreana, c05-vegetarian-lentils, c08-egg-breakfast-1, c09-garbanzos-6, c10-pork-stir-fry, c11-pollo-curry-sin-garbanzos, c12-turkey-sweet-potato, c15-bolognese-high-protein).

Recipe attempts: 0 of 4 cases have reruns (0 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 1 pass, 3 fail, 0 skip; on the last: 1 pass, 14 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 4 | 11 | 0 |
| four_ideas | 4 | 11 | 0 |
| idea_names_60 | 4 | 11 | 0 |
| recipe_json | 1 | 14 | 0 |
| recipe_servings | 1 | 14 | 0 |
| keeps_main_ingredients | 1 | 14 | 0 |
| no_excluded_food | 4 | 11 | 0 |
| dry_grams | 4 | 11 | 0 |
| eggs_in_units | 4 | 11 | 0 |
| grams_every_ingredient | 1 | 14 | 0 |
| macros_vs_target | 1 | 14 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c02-salmon-horno | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c03-tuna-no-cook | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c04-ternera-coreana | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c05-vegetarian-lentils | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c06-chicken-pasta-exclude | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c07-pavo-ligero | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c08-egg-breakfast-1 | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c09-garbanzos-6 | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c10-pork-stir-fry | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c11-pollo-curry-sin-garbanzos | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c12-turkey-sweet-potato | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c13-tuna-microwave | ok | ok | ok | FAIL | FAIL | FAIL | ok | ok | ok | FAIL | FAIL | 1 |
| c14-merluza-patatas | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
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
- c03-tuna-no-cook, ideas_json (fail): no reply file
- c03-tuna-no-cook, four_ideas (fail): no reply file
- c03-tuna-no-cook, idea_names_60 (fail): no reply file
- c03-tuna-no-cook, recipe_json (fail): no reply file
- c03-tuna-no-cook, recipe_servings (fail): no reply file
- c03-tuna-no-cook, keeps_main_ingredients (fail): no reply file
- c03-tuna-no-cook, no_excluded_food (fail): no reply file
- c03-tuna-no-cook, dry_grams (fail): no reply file
- c03-tuna-no-cook, eggs_in_units (fail): no reply file
- c03-tuna-no-cook, grams_every_ingredient (fail): no reply file
- c03-tuna-no-cook, macros_vs_target (fail): no reply file
- c04-ternera-coreana, ideas_json (fail): no reply file
- c04-ternera-coreana, four_ideas (fail): no reply file
- c04-ternera-coreana, idea_names_60 (fail): no reply file
- c04-ternera-coreana, recipe_json (fail): no reply file
- c04-ternera-coreana, recipe_servings (fail): no reply file
- c04-ternera-coreana, keeps_main_ingredients (fail): no reply file
- c04-ternera-coreana, no_excluded_food (fail): no reply file
- c04-ternera-coreana, dry_grams (fail): no reply file
- c04-ternera-coreana, eggs_in_units (fail): no reply file
- c04-ternera-coreana, grams_every_ingredient (fail): no reply file
- c04-ternera-coreana, macros_vs_target (fail): no reply file
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
- c06-chicken-pasta-exclude, recipe_json (fail): no reply stored
- c06-chicken-pasta-exclude, recipe_servings (fail): servings None, form asks 4
- c06-chicken-pasta-exclude, keeps_main_ingredients (fail): recipe has no ingredients
- c06-chicken-pasta-exclude, grams_every_ingredient (fail): recipe has no ingredients
- c06-chicken-pasta-exclude, macros_vs_target (fail): recipe has no ingredients
- c07-pavo-ligero, recipe_json (fail): no reply stored
- c07-pavo-ligero, recipe_servings (fail): servings None, form asks 3
- c07-pavo-ligero, keeps_main_ingredients (fail): recipe has no ingredients
- c07-pavo-ligero, grams_every_ingredient (fail): recipe has no ingredients
- c07-pavo-ligero, macros_vs_target (fail): recipe has no ingredients
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
- c09-garbanzos-6, ideas_json (fail): no reply file
- c09-garbanzos-6, four_ideas (fail): no reply file
- c09-garbanzos-6, idea_names_60 (fail): no reply file
- c09-garbanzos-6, recipe_json (fail): no reply file
- c09-garbanzos-6, recipe_servings (fail): no reply file
- c09-garbanzos-6, keeps_main_ingredients (fail): no reply file
- c09-garbanzos-6, no_excluded_food (fail): no reply file
- c09-garbanzos-6, dry_grams (fail): no reply file
- c09-garbanzos-6, eggs_in_units (fail): no reply file
- c09-garbanzos-6, grams_every_ingredient (fail): no reply file
- c09-garbanzos-6, macros_vs_target (fail): no reply file
- c10-pork-stir-fry, ideas_json (fail): no reply file
- c10-pork-stir-fry, four_ideas (fail): no reply file
- c10-pork-stir-fry, idea_names_60 (fail): no reply file
- c10-pork-stir-fry, recipe_json (fail): no reply file
- c10-pork-stir-fry, recipe_servings (fail): no reply file
- c10-pork-stir-fry, keeps_main_ingredients (fail): no reply file
- c10-pork-stir-fry, no_excluded_food (fail): no reply file
- c10-pork-stir-fry, dry_grams (fail): no reply file
- c10-pork-stir-fry, eggs_in_units (fail): no reply file
- c10-pork-stir-fry, grams_every_ingredient (fail): no reply file
- c10-pork-stir-fry, macros_vs_target (fail): no reply file
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
- c13-tuna-microwave, recipe_json (fail): no reply stored
- c13-tuna-microwave, recipe_servings (fail): servings None, form asks 5
- c13-tuna-microwave, keeps_main_ingredients (fail): recipe has no ingredients
- c13-tuna-microwave, grams_every_ingredient (fail): recipe has no ingredients
- c13-tuna-microwave, macros_vs_target (fail): recipe has no ingredients
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
