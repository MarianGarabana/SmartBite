# Eval run: baseline

Scored 2026-10-20 from `eval/replies/baseline/` against `eval/golden.json`. Code checks only, no model calls.

Score: 153/165 checks passed (92.7%). Skipped: 0. Cases with no reply file: 0.

Recipe attempts: 0 of 15 cases have reruns (0 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 3 pass, 12 fail, 0 skip; on the last: 3 pass, 12 fail, 0 skip.

## Checks

| Check | Pass | Fail | Skip |
|---|---|---|---|
| ideas_json | 15 | 0 | 0 |
| four_ideas | 15 | 0 | 0 |
| idea_names_60 | 15 | 0 | 0 |
| recipe_json | 15 | 0 | 0 |
| recipe_servings | 15 | 0 | 0 |
| keeps_main_ingredients | 15 | 0 | 0 |
| no_excluded_food | 15 | 0 | 0 |
| dry_grams | 15 | 0 | 0 |
| eggs_in_units | 15 | 0 | 0 |
| grams_every_ingredient | 15 | 0 | 0 |
| macros_vs_target | 3 | 12 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c02-salmon-horno | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c03-tuna-no-cook | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c04-ternera-coreana | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c05-vegetarian-lentils | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c06-chicken-pasta-exclude | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c07-pavo-ligero | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c08-egg-breakfast-1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c09-garbanzos-6 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c10-pork-stir-fry | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c11-pollo-curry-sin-garbanzos | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c12-turkey-sweet-potato | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c13-tuna-microwave | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c14-merluza-patatas | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |
| c15-bolognese-high-protein | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 1 |

## Failures and skips

- c01-greek-chicken, macros_vs_target (fail): protein 55 g is more than 20% over target 45 g (466 kcal, 55 g protein, 40 g carbs, 8 g fat)
- c03-tuna-no-cook, macros_vs_target (fail): protein 57 g is more than 20% over target 45 g (467 kcal, 57 g protein, 39 g carbs, 7 g fat)
- c04-ternera-coreana, macros_vs_target (fail): kcal 620 vs target 500 (620 kcal, 49 g protein, 51 g carbs, 24 g fat)
- c05-vegetarian-lentils, macros_vs_target (fail): kcal 498 vs target 450 (498 kcal, 33 g protein, 64 g carbs, 7 g fat)
- c06-chicken-pasta-exclude, macros_vs_target (fail): protein 60 g is more than 20% over target 45 g (502 kcal, 60 g protein, 43 g carbs, 8 g fat)
- c07-pavo-ligero, macros_vs_target (fail): kcal 301 vs target 350; protein 49 g is more than 20% over target 40 g (301 kcal, 49 g protein, 6 g carbs, 8 g fat)
- c09-garbanzos-6, macros_vs_target (fail): kcal 522 vs target 450 (522 kcal, 29 g protein, 64 g carbs, 11 g fat)
- c10-pork-stir-fry, macros_vs_target (fail): kcal 604 vs target 500; protein 58 g is more than 20% over target 45 g (604 kcal, 58 g protein, 47 g carbs, 19 g fat)
- c11-pollo-curry-sin-garbanzos, macros_vs_target (fail): kcal 500 vs target 450; protein 58 g is more than 20% over target 45 g (500 kcal, 58 g protein, 45 g carbs, 8 g fat)
- c13-tuna-microwave, macros_vs_target (fail): kcal 399 vs target 450 (399 kcal, 45 g protein, 34 g carbs, 7 g fat)
- c14-merluza-patatas, macros_vs_target (fail): kcal 514 vs target 450 (514 kcal, 43 g protein, 51 g carbs, 13 g fat)
- c15-bolognese-high-protein, macros_vs_target (fail): kcal 671 vs target 600 (671 kcal, 50 g protein, 66 g carbs, 20 g fat)
