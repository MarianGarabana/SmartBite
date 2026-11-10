# Live run usage: live-gemini-36-effort-c

Provider gemini, model `gemini-3.6-flash`, spend limit $2.00. Finished 2026-11-03T10:07:08+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-27), read 2026-10-27"}.

| Measure | Value |
|---|---|
| Calls | 24 (9 failed, 0 contract retries) |
| Input tokens (uncached) | 34046 |
| Output tokens | 26911 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1264 |
| Meals (cases with an evaluated recipe) | 6 |
| Cost per meal, mean / max | $0.0198 / $0.0287 |
| Mean latency per call | 9.7 s |
| Reruns | 5 in 5 cases |

Kept attempt is not the last one (eval.run scores the last): c04-ternera-coreana, c05-vegetarian-lentils, c09-garbanzos-6, c11-pollo-curry-sin-garbanzos.

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | error | 1 | - | - | $0.0000 |
| c03-tuna-no-cook | error | 2 | - | - | $0.0038 |
| c04-ternera-coreana | ok | 3 | 1 (1), 2 (err) | 1 | $0.0183 |
| c05-vegetarian-lentils | ok | 3 | 1 (2), 2 (err) | 1 | $0.0206 |
| c09-garbanzos-6 | ok | 3 | 1 (1), 2 (err) | 1 | $0.0153 |
| c10-pork-stir-fry | ok | 2 | 1 (0) | 1 | $0.0160 |
| c11-pollo-curry-sin-garbanzos | ok | 3 | 1 (2), 2 (err) | 1 | $0.0198 |
| c12-turkey-sweet-potato | error | 2 | - | - | $0.0038 |
| c13-tuna-microwave | ok | 3 | 1 (2), 2 (0) | 2 | $0.0287 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |
| c15-bolognese-high-protein | error | 1 | - | - | $0.0000 |

## Errors

- c01-greek-chicken: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c03-tuna-no-cook: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c12-turkey-sweet-potato: HTTP 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- c14-merluza-patatas: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
- c15-bolognese-high-protein: HTTP 429: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.g
