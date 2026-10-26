# Live run usage: live-gemini-v3e

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-26T09:06:54+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 15 (7 failed, 1 contract retries) |
| Input tokens (uncached) | 19745 |
| Output tokens | 33392 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1400 |
| Meals (cases with an evaluated recipe) | 3 |
| Cost per meal, mean / max | $0.0467 / $0.0687 |
| Mean latency per call | 250.9 s |
| Reruns | 3 in 3 cases |

Kept attempt is not the last one (eval.run scores the last): c10-pork-stir-fry, c12-turkey-sweet-potato.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c07-pavo-ligero | ok | 3 | 1 (2), 2 (0) | 2 | $0.0458 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | ok | 3 | 1 (1), 2 (err) | 1 | $0.0255 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | ok | 4 | 1 (1), 2 (err) | 1 | $0.0687 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |

## Errors

- c06-chicken-pasta-exclude: HTTP None: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1028)>
- c08-egg-breakfast-1: HTTP None: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1028)>
- c09-garbanzos-6: HTTP None: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1028)>
- c11-pollo-curry-sin-garbanzos: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c13-tuna-microwave: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
