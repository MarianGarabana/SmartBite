# Live run usage: live-gemini-v3b

Provider gemini, model `gemini-3.8-flash`, spend limit $1.89. Finished 2026-10-20T08:07:42+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 21 (10 failed, 0 contract retries) |
| Input tokens (uncached) | 25363 |
| Output tokens | 33166 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1434 |
| Meals (cases with an evaluated recipe) | 4 |
| Cost per meal, mean / max | $0.0291 / $0.0413 |
| Mean latency per call | 121.1 s |
| Reruns | 2 in 2 cases |

Kept attempt is not the last one (eval.run scores the last): c15-bolognese-high-protein.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | ok | 2 | 1 (0) | 1 | $0.0276 |
| c04-ternera-coreana | ok | 2 | 1 (0) | 1 | $0.0209 |
| c05-vegetarian-lentils | ok | 3 | 1 (2), 2 (0) | 2 | $0.0413 |
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c07-pavo-ligero | error | 1 | - | - | $0.0000 |
| c08-egg-breakfast-1 | error | 2 | - | - | $0.0117 |
| c09-garbanzos-6 | error | 2 | - | - | $0.0151 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |
| c15-bolognese-high-protein | ok | 3 | 1 (1), 2 (err) | 1 | $0.0268 |

## Errors

- c06-chicken-pasta-exclude: HTTP 503:
- c07-pavo-ligero: HTTP 503:
- c08-egg-breakfast-1: HTTP 503:
- c09-garbanzos-6: HTTP 429:
- c10-pork-stir-fry: HTTP 429:
- c11-pollo-curry-sin-garbanzos: HTTP 429:
- c12-turkey-sweet-potato: HTTP 429:
- c13-tuna-microwave: HTTP 429:
- c14-merluza-patatas: HTTP 429:
