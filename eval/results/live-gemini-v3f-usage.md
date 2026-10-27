# Live run usage: live-gemini-v3f

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-27T12:26:55+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 7 (3 failed, 0 contract retries) |
| Input tokens (uncached) | 8834 |
| Output tokens | 14802 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0621 |
| Meals (cases with an evaluated recipe) | 2 |
| Cost per meal, mean / max | $0.0311 / $0.0322 |
| Mean latency per call | 334.8 s |
| Reruns | 0 in 0 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | ok | 2 | 1 (0) | 1 | $0.0300 |
| c11-pollo-curry-sin-garbanzos | ok | 2 | 1 (0) | 1 | $0.0322 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |

## Errors

- c06-chicken-pasta-exclude: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c08-egg-breakfast-1: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c13-tuna-microwave: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
