# Live run usage: live-gemini-36

Provider gemini, model `gemini-3.6-flash`, spend limit $2.00. Finished 2026-10-27T13:09:48+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-27), read 2026-10-27"}.

| Measure | Value |
|---|---|
| Calls | 22 (15 failed, 1 contract retries) |
| Input tokens (uncached) | 14786 |
| Output tokens | 15794 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0703 |
| Meals (cases with an evaluated recipe) | 1 |
| Cost per meal, mean / max | $0.0199 / $0.0199 |
| Mean latency per call | 15.0 s |
| Reruns | 1 in 1 cases |

Kept attempt is not the last one (eval.run scores the last): c14-merluza-patatas.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | error | 1 | - | - | $0.0000 |
| c02-salmon-horno | error | 1 | - | - | $0.0000 |
| c03-tuna-no-cook | error | 1 | - | - | $0.0000 |
| c04-ternera-coreana | error | 2 | - | - | $0.0087 |
| c05-vegetarian-lentils | error | 1 | - | - | $0.0000 |
| c06-chicken-pasta-exclude | error | 2 | - | - | $0.0110 |
| c07-pavo-ligero | error | 2 | - | - | $0.0098 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 2 | - | - | $0.0094 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 2 | - | - | $0.0114 |
| c14-merluza-patatas | ok | 3 | 1 (1), 2 (err) | 1 | $0.0199 |
| c15-bolognese-high-protein | error | 1 | - | - | $0.0000 |

## Errors

- c01-greek-chicken: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c02-salmon-horno: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c03-tuna-no-cook: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c04-ternera-coreana: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c05-vegetarian-lentils: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c06-chicken-pasta-exclude: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c07-pavo-ligero: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c08-egg-breakfast-1: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c09-garbanzos-6: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c10-pork-stir-fry: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c11-pollo-curry-sin-garbanzos: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c12-turkey-sweet-potato: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c13-tuna-microwave: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c15-bolognese-high-protein: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
