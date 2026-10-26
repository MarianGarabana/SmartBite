# Eval run: live-gemini

Scored 2026-10-26 from `eval/replies/live-gemini/` against `eval/golden.json`. Code checks only, no model calls.

Score: 108/165 checks passed (65.5%). Skipped: 0. Cases with no reply file: 5 (c06-chicken-pasta-exclude, c08-egg-breakfast-1, c09-garbanzos-6, c11-pollo-curry-sin-garbanzos, c13-tuna-microwave).

Recipe attempts: 3 of 10 cases have reruns (3 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 6 pass, 4 fail, 0 skip; on the last: 8 pass, 7 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 10 | 5 | 0 |
| four_ideas | 10 | 5 | 0 |
| idea_names_60 | 10 | 5 | 0 |
| recipe_json | 10 | 5 | 0 |
| recipe_servings | 10 | 5 | 0 |
| keeps_main_ingredients | 10 | 5 | 0 |
| no_excluded_food | 10 | 5 | 0 |
| dry_grams | 10 | 5 | 0 |
| eggs_in_units | 10 | 5 | 0 |
| grams_every_ingredient | 10 | 5 | 0 |
| macros_vs_target | 8 | 7 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c02-salmon-horno | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c03-tuna-no-cook | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c04-ternera-coreana | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c05-vegetarian-lentils | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c06-chicken-pasta-exclude | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c07-pavo-ligero | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c08-egg-breakfast-1 | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c09-garbanzos-6 | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c10-pork-stir-fry | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c11-pollo-curry-sin-garbanzos | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c12-turkey-sweet-potato | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c13-tuna-microwave | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | - |
| c14-merluza-patatas | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c15-bolognese-high-protein | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |

## Failures and skips

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
- c12-turkey-sweet-potato, macros_vs_target (fail): protein 40 g vs target 45 g (420 kcal, 40 g protein, 37 g carbs, 10 g fat)
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
- c15-bolognese-high-protein, macros_vs_target (fail): kcal 691 vs target 600 (691 kcal, 55 g protein, 53 g carbs, 26 g fat)
