# Live run usage: live-gemini-lite-2

Provider gemini, model `gemini-3.5-flash-lite`, spend limit $2.00. Finished 2026-10-26T09:49:28+00:00.
Prices (USD per MTok): {"input": 0.3, "output": 2.5, "cache_write": null, "cache_read": 0.03, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-22), read 2026-10-26"}.

| Measure | Value |
|---|---|
| Calls | 52 (0 failed, 1 contract retries) |
| Input tokens (uncached) | 140086 |
| Output tokens | 29882 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1167 |
| Meals (cases with an evaluated recipe) | 15 |
| Cost per meal, mean / max | $0.0078 / $0.0103 |
| Mean latency per call | 2.0 s |
| Reruns | 22 in 14 cases |

Kept attempt is not the last one (eval.run scores the last): c03-tuna-no-cook, c06-chicken-pasta-exclude.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | ok | 3 | 1 (3), 2 (0) | 2 | $0.0072 |
| c02-salmon-horno | ok | 4 | 1 (1), 2 (1), 3 (1) | 3 | $0.0095 |
| c03-tuna-no-cook | ok | 4 | 1 (3), 2 (1), 3 (err) | 2 | $0.0087 |
| c04-ternera-coreana | ok | 4 | 1 (2), 2 (1), 3 (1) | 3 | $0.0076 |
| c05-vegetarian-lentils | ok | 3 | 1 (2), 2 (0) | 2 | $0.0068 |
| c06-chicken-pasta-exclude | ok | 4 | 1 (2), 2 (1), 3 (2) | 2 | $0.0090 |
| c07-pavo-ligero | ok | 2 | 1 (0) | 1 | $0.0041 |
| c08-egg-breakfast-1 | ok | 4 | 1 (4), 2 (2), 3 (2) | 3 | $0.0081 |
| c09-garbanzos-6 | ok | 4 | 1 (1), 2 (1), 3 (1) | 3 | $0.0095 |
| c10-pork-stir-fry | ok | 3 | 1 (2), 2 (0) | 2 | $0.0071 |
| c11-pollo-curry-sin-garbanzos | ok | 3 | 1 (2), 2 (0) | 2 | $0.0071 |
| c12-turkey-sweet-potato | ok | 4 | 1 (3), 2 (4), 3 (3) | 3 | $0.0103 |
| c13-tuna-microwave | ok | 3 | 1 (2), 2 (0) | 2 | $0.0058 |
| c14-merluza-patatas | ok | 3 | 1 (1), 2 (0) | 2 | $0.0060 |
| c15-bolognese-high-protein | ok | 4 | 1 (2), 2 (2), 3 (1) | 3 | $0.0099 |
