# Eval run: live-gemini-lite-2

Scored 2026-10-26 from `eval/replies/live-gemini-lite-2/` against `eval/golden.json`. Code checks only, no model calls.

Score: 157/165 checks passed (95.2%). Skipped: 0. Cases with no reply file: 0.

Recipe attempts: 14 of 15 cases have reruns (21 reruns in all). The recipe checks use the last recipe. macros_vs_target on the first recipe: 2 pass, 13 fail, 0 skip; on the last: 7 pass, 8 fail, 0 skip.

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
| macros_vs_target | 7 | 8 | 0 |

## Cases

| Case | ideas_json | four_ideas | idea_names_60 | recipe_json | recipe_servings | keeps_main_ingredients | no_excluded_food | dry_grams | eggs_in_units | grams_every_ingredient | macros_vs_target | attempts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c01-greek-chicken | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c02-salmon-horno | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c03-tuna-no-cook | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 2 |
| c04-ternera-coreana | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c05-vegetarian-lentils | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c06-chicken-pasta-exclude | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c07-pavo-ligero | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 1 |
| c08-egg-breakfast-1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c09-garbanzos-6 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c10-pork-stir-fry | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c11-pollo-curry-sin-garbanzos | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c12-turkey-sweet-potato | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |
| c13-tuna-microwave | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c14-merluza-patatas | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | 2 |
| c15-bolognese-high-protein | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok | FAIL | 3 |

## Failures and skips

- c02-salmon-horno, macros_vs_target (fail): kcal 551 vs target 500 (551 kcal, 41 g protein, 42 g carbs, 23 g fat)
- c03-tuna-no-cook, macros_vs_target (fail): kcal 354 vs target 450 (354 kcal, 47 g protein, 29 g carbs, 3 g fat)
- c04-ternera-coreana, macros_vs_target (fail): protein 30 g vs target 45 g (462 kcal, 30 g protein, 57 g carbs, 12 g fat)
- c06-chicken-pasta-exclude, macros_vs_target (fail): kcal 654 vs target 500; protein 61 g is more than 20% over target 45 g (654 kcal, 61 g protein, 57 g carbs, 18 g fat)
- c08-egg-breakfast-1, macros_vs_target (fail): kcal 471 vs target 400; protein 44 g is more than 20% over target 30 g (471 kcal, 44 g protein, 24 g carbs, 20 g fat)
- c09-garbanzos-6, macros_vs_target (fail): kcal 641 vs target 450 (641 kcal, 34 g protein, 74 g carbs, 16 g fat)
- c12-turkey-sweet-potato, macros_vs_target (fail): protein 27 g vs target 45 g; carbs 45 g over max 40 g (425 kcal, 27 g protein, 45 g carbs, 13 g fat)
- c15-bolognese-high-protein, macros_vs_target (fail): protein 44 g vs target 50 g (625 kcal, 44 g protein, 68 g carbs, 18 g fat)
