# Live run usage: live-gemini-v3g

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-27T12:55:38+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 5 (3 failed, 1 contract retries) |
| Input tokens (uncached) | 4162 |
| Output tokens | 6238 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0265 |
| Meals (cases with an evaluated recipe) | 0 |
| Cost per meal, mean / max | - / - |
| Mean latency per call | 331.0 s |
| Reruns | 0 in 0 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c06-chicken-pasta-exclude | error | 2 | - | - | $0.0144 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 2 | - | - | $0.0121 |

## Errors

- c06-chicken-pasta-exclude: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c08-egg-breakfast-1: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c13-tuna-microwave: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
