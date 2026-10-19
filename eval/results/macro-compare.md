# Macro compare: open engine vs personal app

Per-serving kcal and protein for the 13 demo meals. Built by `eval/macro_compare.py`; do not edit by hand.

**Reference, not ground truth.** The personal values come from the personal app's own nutrition sources (product labels and a national food table). The open engine uses Ciqual 2025 and USDA FoodData Central for generic foods. A difference shows how far generic table values sit from those sources, not which one is right.

Error = (open - reference) / reference. "Within 10%" counts meals with an absolute error of 10% or less.

## Aggregates

| Meals | n | kcal mean abs error | kcal max | kcal within 10% | protein mean abs error | protein max | protein within 10% |
|---|---|---|---|---|---|---|---|
| All | 13 | 5.7% | 22.2% | 12 of 13 | 5.1% | 12.6% | 12 of 13 |

## Per meal

| Meal | kcal ref | kcal open | kcal error | protein ref (g) | protein open (g) | protein error | not in the open table |
|---|---|---|---|---|---|---|---|
| Ground turkey bowl with sweet potato and spinach | 452 | 454 | +0.5% | 46.0 | 41.5 | -9.8% | - |
| Tuna and chickpea salad with skyr dressing | 458 | 560 | +22.2% | 60.3 | 67.9 | +12.6% | - |
| Tuna frittata with vegetables | 470 | 510 | +8.4% | 49.5 | 49.4 | -0.2% | - |
| Classic lentil stew with chickpeas and chicken | 452 | 457 | +1.1% | 46.4 | 49.9 | +7.3% | - |
| Mild chicken breast curry with rice | 483 | 456 | -5.6% | 52.3 | 55.4 | +5.9% | - |
| Roast chicken with roast potatoes | 479 | 485 | +1.2% | 57.3 | 60.4 | +5.3% | - |
| Oven-baked chicken with zucchini and orange | 447 | 443 | -0.9% | 52.3 | 52.6 | +0.7% | - |
| Chicken breast bowl with rice and vegetables | 443 | 470 | +6.0% | 45.2 | 44.9 | -0.7% | - |
| Whole wheat pasta salad with tuna and arugula | 439 | 470 | +7.0% | 47.4 | 43.4 | -8.5% | - |
| Tuna Artichoke Whole Wheat Pasta Salad | 416 | 457 | +9.7% | 43.1 | 39.1 | -9.2% | - |
| Chicken salad with sweet potato, walnuts and mustard yogurt | 487 | 484 | -0.7% | 44.9 | 45.5 | +1.4% | - |
| Carrot cake overnight oats with berries | 466 | 486 | +4.3% | 45.5 | 45.1 | -0.9% | - |
| Korean beef bowl with peas and brown rice-lentil mix | 455 | 486 | +6.7% | 38.7 | 40.2 | +4.0% | - |
