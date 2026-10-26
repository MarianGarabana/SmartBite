# Live run usage: live-gemini-v3c

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-22T16:27:09+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 9 (9 failed, 0 contract retries) |
| Input tokens (uncached) | 0 |
| Output tokens | 0 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0000 |
| Meals (cases with an evaluated recipe) | 0 |
| Cost per meal, mean / max | - / - |
| Mean latency per call | - |
| Reruns | 0 in 0 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c07-pavo-ligero | error | 1 | - | - | $0.0000 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |

## Errors

- c06-chicken-pasta-exclude: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c07-pavo-ligero: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c08-egg-breakfast-1: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c09-garbanzos-6: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c10-pork-stir-fry: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c11-pollo-curry-sin-garbanzos: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c12-turkey-sweet-potato: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c13-tuna-microwave: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c14-merluza-patatas: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
