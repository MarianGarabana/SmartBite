# Eval run: live-gemini

Scored 2026-10-27 from `eval/replies/live-gemini/` against `eval/golden.json`. Code checks only, no model calls.

Score: 130/165 checks passed (78.8%). Skipped: 0. Cases with no reply file: 3 (c06-chicken-pasta-exclude, c08-egg-breakfast-1, c13-tuna-microwave).

Recipe attempts: 3 of 12 cases have reruns (3 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 8 pass, 4 fail, 0 skip; on the last: 10 pass, 5 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 12 | 3 | 0 |
| four_ideas | 12 | 3 | 0 |
| idea_names_60 | 12 | 3 | 0 |
| recipe_json | 12 | 3 | 0 |
| recipe_servings | 12 | 3 | 0 |
| keeps_main_ingredients | 12 | 3 | 0 |
| no_excluded_food | 12 | 3 | 0 |
| dry_grams | 12 | 3 | 0 |
| eggs_in_units | 12 | 3 | 0 |
| grams_every_ingredient | 12 | 3 | 0 |
| macros_vs_target | 10 | 5 | 0 |

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
| c09-garbanzos-6 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c10-pork-stir-fry | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c11-pollo-curry-sin-garbanzos | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
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
