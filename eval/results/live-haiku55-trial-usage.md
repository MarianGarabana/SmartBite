# Live run usage: live-haiku55-trial

Provider anthropic, model `claude-haiku-5-5`, spend limit $0.60. Finished 2026-11-20T16:42:38+00:00.
Prices (USD per MTok): {"input": 0.1, "output": 0.5, "cache_write": 0.125, "cache_read": 0.01, "source": "claude-api skill (cached 2026-10-06), read 2026-10-19; cache prices derived"}.

| Measure | Value |
|---|---|
| Calls | 38 (0 failed, 0 contract retries) |
| Input tokens (uncached) | 157140 |
| Output tokens | 107972 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.0697 |
| Meals (cases with an evaluated recipe) | 15 |
| Cost per meal, mean / max | $0.0046 / $0.0058 |
| Mean latency per call | 12.4 s |
| Reruns | 8 in 8 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | ok | 3 | 1 (1), 2 (0) | 2 | $0.0056 |
| c02-salmon-horno | ok | 3 | 1 (2), 2 (0) | 2 | $0.0051 |
| c03-tuna-no-cook | ok | 3 | 1 (2), 2 (0) | 2 | $0.0049 |
| c04-ternera-coreana | ok | 3 | 1 (1), 2 (0) | 2 | $0.0055 |
| c05-vegetarian-lentils | ok | 2 | 1 (0) | 1 | $0.0037 |
| c06-chicken-pasta-exclude | ok | 2 | 1 (0) | 1 | $0.0040 |
| c07-pavo-ligero | ok | 2 | 1 (0) | 1 | $0.0038 |
| c08-egg-breakfast-1 | ok | 3 | 1 (2), 2 (0) | 2 | $0.0048 |
| c09-garbanzos-6 | ok | 2 | 1 (0) | 1 | $0.0036 |
| c10-pork-stir-fry | ok | 3 | 1 (1), 2 (0) | 2 | $0.0049 |
| c11-pollo-curry-sin-garbanzos | ok | 3 | 1 (1), 2 (0) | 2 | $0.0054 |
| c12-turkey-sweet-potato | ok | 3 | 1 (1), 2 (0) | 2 | $0.0058 |
| c13-tuna-microwave | ok | 2 | 1 (0) | 1 | $0.0044 |
| c14-merluza-patatas | ok | 2 | 1 (0) | 1 | $0.0031 |
| c15-bolognese-high-protein | ok | 2 | 1 (0) | 1 | $0.0050 |
