# Live run usage: live-gemini-v3d

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-23T19:45:45+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 13 (8 failed, 0 contract retries) |
| Input tokens (uncached) | 10616 |
| Output tokens | 16436 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0696 |
| Meals (cases with an evaluated recipe) | 1 |
| Cost per meal, mean / max | $0.0364 / $0.0364 |
| Mean latency per call | 268.9 s |
| Reruns | 0 in 0 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c06-chicken-pasta-exclude | error | 2 | - | - | $0.0090 |
| c07-pavo-ligero | error | 2 | - | - | $0.0100 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 2 | - | - | $0.0142 |
| c14-merluza-patatas | ok | 2 | 1 (0) | 1 | $0.0364 |

## Errors

- c06-chicken-pasta-exclude: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c07-pavo-ligero: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c08-egg-breakfast-1: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c09-garbanzos-6: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c10-pork-stir-fry: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c11-pollo-curry-sin-garbanzos: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c12-turkey-sweet-potato: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c13-tuna-microwave: HTTP None: The read operation timed out
