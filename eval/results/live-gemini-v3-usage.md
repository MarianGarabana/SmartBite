# Live run usage: live-gemini-v3

Provider gemini, model `gemini-3.8-flash`, spend limit $2.00. Finished 2026-10-20T07:42:37+00:00.
Prices (USD per MTok): {"input": 0.75, "output": 3.75, "cache_write": null, "cache_read": 0.075, "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19"}.

| Measure | Value |
|---|---|
| Calls | 19 (13 failed, 0 contract retries) |
| Input tokens (uncached) | 14029 |
| Output tokens | 26542 |
| Cache write / read tokens | 0 / 0 |
| Total cost | $0.1101 |
| Meals (cases with an evaluated recipe) | 2 |
| Cost per meal, mean / max | $0.0500 / $0.0706 |
| Mean latency per call | 85.4 s |
| Reruns | 1 in 1 cases |

## Cases

| Case | Status | Calls | Attempts (problems) | Kept | Cost |
|---|---|---|---|---|---|
| c01-greek-chicken | error | 2 | - | - | $0.0100 |
| c02-salmon-horno | ok | 2 | 1 (0) | 1 | $0.0294 |
| c03-tuna-no-cook | ok | 3 | 1 (1), 2 (0) | 2 | $0.0706 |
| c04-ternera-coreana | error | 1 | - | - | $0.0000 |
| c05-vegetarian-lentils | error | 1 | - | - | $0.0000 |
| c06-chicken-pasta-exclude | error | 1 | - | - | $0.0000 |
| c07-pavo-ligero | error | 1 | - | - | $0.0000 |
| c08-egg-breakfast-1 | error | 1 | - | - | $0.0000 |
| c09-garbanzos-6 | error | 1 | - | - | $0.0000 |
| c10-pork-stir-fry | error | 1 | - | - | $0.0000 |
| c11-pollo-curry-sin-garbanzos | error | 1 | - | - | $0.0000 |
| c12-turkey-sweet-potato | error | 1 | - | - | $0.0000 |
| c13-tuna-microwave | error | 1 | - | - | $0.0000 |
| c14-merluza-patatas | error | 1 | - | - | $0.0000 |
| c15-bolognese-high-protein | error | 1 | - | - | $0.0000 |

## Errors

- c01-greek-chicken: HTTP 503:
- c04-ternera-coreana: HTTP None: The read operation timed out
- c05-vegetarian-lentils: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c06-chicken-pasta-exclude: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c07-pavo-ligero: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c08-egg-breakfast-1: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c09-garbanzos-6: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c10-pork-stir-fry: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c11-pollo-curry-sin-garbanzos: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c12-turkey-sweet-potato: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c13-tuna-microwave: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c14-merluza-patatas: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
- c15-bolognese-high-protein: HTTP None: <urlopen error [Errno 8] nodename nor servname provided, or not known>
