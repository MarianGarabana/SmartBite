# Recipe import eval log

date | change | model | pass rate | fails (ids)
---|---|---|---|---
2026-11-10 | v1: first prompt (prompts/import.md sha 70900dd8b303) | gemini-3.6-flash | 5/10 (es-filete-pollo no reply: HTTP 429 free-tier quota) | en-shakshouka (chile 15 g), en-chicken-curry ("chicken" not mapped), es-huevos-flamenca (patatas grandes 800 g), en-beef-stew (4 large carrots 400 g)
2026-11-10 | grader fix: a food first goes to a line that accepts its name (a step naming coriander and lemon juice filed coriander under lemon); all runs rescored, only v2-sonnet en-chicken-curry changed (fail -> pass) | - | - | -
2026-11-10 | v2: + "general name -> most usual kind", + "large 1.5x / small 0.6x medium" | gemini-3.6-flash | 1/2 answered (8 cases no reply: HTTP 429 free daily quota) | es-filete-pollo (2 zanahorias medianas 200 g)
2026-11-10 | v2 prompt on Sonnet (effort medium, recipe settings) | claude-sonnet-5-5 | 6/10, 10 calls, $0.17 | en-shakshouka (chile 15 g, key 34-56), en-chicken-fajitas (bell peppers 150 g, key top 149), es-filete-pollo (morron 150 g, key top 149), es-huevos-flamenca (patatas grandes 900 g, key 1107-1845)
