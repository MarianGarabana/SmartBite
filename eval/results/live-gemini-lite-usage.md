# Live run usage: live-gemini-lite

Provider gemini, model `gemini-3.5-flash-lite`, spend limit $2.00. Finished 2026-10-26T09:44:09+00:00.
Prices (USD per MTok): {"input": 0.3, "output": 2.5, "cache_write": null, "cache_read": 0.03, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-22), read 2026-10-26"}.

| Measure | Value |
|---|---|
| Calls | 28 (11 failed, 0 contract retries) |
| Input tokens (uncached) | 47091 |
| Output tokens | 9991 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0391 |
| Meals (cases with an evaluated recipe) | 4 |
| Cost per meal, mean / max | $0.0092 / $0.0103 |
| Mean latency per call | 2.0 s |
| Reruns | 8 in 4 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | ok | 4 | 1 (2), 2 (1), 3 (0) | 3 | $0.0103 |
| c02-salmon-horno | ok | 4 | 1 (1), 2 (2), 3 (1) | 3 | $0.0090 |
| c03-tuna-no-cook | ok | 4 | 1 (2), 2 (2), 3 (1) | 3 | $0.0086 |
| c04-ternera-coreana | ok | 4 | 1 (2), 2 (2), 3 (1) | 3 | $0.0091 |
| c05-vegetarian-lentils | error | 1 | - | - | $0.0000 |
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c07-pavo-ligero | error | 2 | - | - | $0.0021 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |
| c15-bolognese-high-protein | error | 1 | - | - | $0.0000 |

## Errors

- c05-vegetarian-lentils: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c06-chicken-pasta-exclude: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c07-pavo-ligero: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c08-egg-breakfast-1: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c09-garbanzos-6: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
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
- c15-bolognese-high-protein: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
