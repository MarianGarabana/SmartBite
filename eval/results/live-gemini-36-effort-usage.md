# Live run usage: live-gemini-36-effort

Provider gemini, model `gemini-3.6-flash`, spend limit $2.00. Finished 2026-11-01T14:08:48+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-27), read 2026-10-27"}.

| Measure | Value |
|---|---|
| Calls | 29 (12 failed, 1 contract retries) |
| Input tokens (uncached) | 41420 |
| Output tokens | 23125 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1178 |
| Meals (cases with an evaluated recipe) | 4 |
| Cost per meal, mean / max | $0.0247 / $0.0297 |
| Mean latency per call | 9.5 s |
| Reruns | 4 in 4 cases |

Kept attempt is not the last one (eval.run scores the last): c02-salmon-horno.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | error | 2 | - | - | $0.0039 |
| c02-salmon-horno | ok | 3 | 1 (1), 2 (err) | 1 | $0.0150 |
| c03-tuna-no-cook | error | 2 | - | - | $0.0038 |
| c04-ternera-coreana | error | 2 | - | - | $0.0037 |
| c05-vegetarian-lentils | error | 1 | - | - | $0.0000 |
| c06-chicken-pasta-exclude | ok | 4 | 1 (1), 2 (0) | 2 | $0.0297 |
| c07-pavo-ligero | ok | 3 | 1 (1), 2 (0) | 2 | $0.0279 |
| c08-egg-breakfast-1 | ok | 3 | 1 (3), 2 (0) | 2 | $0.0260 |
| c09-garbanzos-6 | error | 2 | - | - | $0.0038 |
| c10-pork-stir-fry | error | 2 | - | - | $0.0039 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |
| c15-bolognese-high-protein | error | 1 | - | - | $0.0000 |

## Errors

- c01-greek-chicken: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c03-tuna-no-cook: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c04-ternera-coreana: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c05-vegetarian-lentils: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c09-garbanzos-6: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c10-pork-stir-fry: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c11-pollo-curry-sin-garbanzos: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c12-turkey-sweet-potato: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c13-tuna-microwave: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c14-merluza-patatas: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c15-bolognese-high-protein: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
