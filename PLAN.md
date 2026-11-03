# SmartBite open: plan

Decided with Marian on 2026-10-19 (research report and two question rounds). Goal: portfolio first, income only if it gets traction later.

## v1 scope

Craving in, 4 ideas, pick one, recipe in grams, shopping list in whole packs, macros computed in code, leftovers adjusted to servings. Photo stays a copyable prompt. No store needed: typical pack sizes from Open Food Facts (editable), optional user prices (budget check runs only when prices exist). English UI. Same design as the personal app.

Architecture: the LLM is called from the browser with the user's own Anthropic key (Sonnet 5.5 default, Haiku 5.5 option). The Python engine runs as a Vercel function (FastAPI). Free demo on Vercel Hobby with pre-built meals, no ads, no affiliate links.

Added 2026-10-19 (P25-P27): demo meals are Marian's 13 saved meals (store data removed, recomputed by the engine, English ingredient names) with her Gemini photos labeled AI-generated. Besides Anthropic, one OpenAI-compatible adapter (OpenAI, OpenRouter, Gemini, Ollama) marked experimental.

## Shared shapes

- **Meal result** (engine output, web input): `{form, picked_idea, recipe, evaluation: {pack, macros}}`, same fields as the personal app's saved meals, without store fields (`counts`, `live_session`, `auto_matched`). Schema: `docs/contracts/meal.schema.json`.
- **Product option** (input to `pack_line`): `{name, link, sold_by: pack|per_kg|per_unit, pack_grams, price_eur, price_per_kg_eur, units_per_pack, other_options, always, price_date, price_source}`. Generic packs produce this shape with `price_eur` null unless the user set a price.

## Phases and the check that proves each

| # | Phase | Check |
|---|---|---|
| 0 | Repo, license, pure engine (`calc`, `pack`, `form`) with tests | `pytest` passes; no personal or store refs (grep) |
| 1 | Open nutrition table: Ciqual 2025 + USDA FDC for every food the app uses; resolver without BEDCA | `pytest`; every food has source, source id and match note; review list for Marian |
| 2 | Typical pack sizes from Open Food Facts (Spain), loose items per kg; generic product options | `pytest`; coverage report; ODbL LICENSE in the data folder |
| 3 | Prompts, contracts, default Kitchen Profile, 83 inspiration dishes, eval harness with 15 cravings | `pytest`; harness scores stored replies; baseline run via Claude Code subagents |
| 4 | Engine API (FastAPI on Vercel): recipe -> packs, macros, leftovers | `pytest` with API tests; local `vercel dev` call |
| 5 | Web: design port, demo mode, profile in browser, BYOK key, AI label, privacy note, LLM calls from browser | `npm run build`; Playwright run of the full flow on demo data |
| 6 | README with measured numbers: generic macros vs label on Marian's 10 meals (aggregates only), cost per meal from one real API run (Marian's OK, key with a $5 limit) | verifier agent passes |
| 7 | Deploy demo, push public repo (Marian's OK), LinkedIn post | live URL works; Marian approves post |

## After v1: region and supermarket (added 2026-10-20)

v1 stays general: open nutrition tables and typical packs. The author's personal app is the specific version (her store catalog, her labels, her profile) and stays private. More depth comes when a user sets a region and a supermarket, from open sources or the user only: (1) the user's own labels and prices, entered once and used for that food from then on; (2) Open Food Facts products filtered by country and store tag, or found by barcode, for real pack sizes and nutrition per 100 g; (3) Open Food Facts Open Prices by location for reported prices. No store scraping.

### More countries (decided 2026-11-03)

The country list holds the countries with supermarket data, then "Other country" (generic packs, no stores, the user's own
prices). Each country gets the largest supermarket chains as labels, typical pack sizes from Open Food Facts for that
country (its own sizes where a food has at least 5 products, else the generic ones) and estimated prices from official
statistics: the average of the latest 12 months, national only, per kg in the country's currency. Foods with no official
price show "add your price". No store site is contacted. Recipes, prompts and the food list do not change.

| Step | Country | Price source |
|---|---|---|
| 1 | List of 8 countries and their chains | none (labels) |
| 2 | Canada | Statistics Canada, table 18-10-0245-01 |
| 3 | United Kingdom | ONS shopping prices comparison |
| 4 | United States | BLS Average Price Data (header `User-Agent: SmartBite` only; else one manual download) |
| 5 | Ireland | CSO, National Average Price (CPM12) |
| 6 | France | INSEE, prix moyens de vente de detail (fresh foods only) |
| 7 | Mexico | PROFECO, Quien es quien en los precios (national median of store prices) |
| 8 | Australia | none found: pack sizes and chains only |

Spain keeps MAPA, national and per comunidad autonoma. Germany, Italy, Portugal and the Netherlands have no current
official average prices and stay under "Other country".

## Open questions (decide in the phase named)

- Phase 4: leftovers adjust stays client side in JS for v1 (it already works in the browser); port to Python only if the API needs it.
- Phase 5: second language (Spanish) after v1.
- Phase 6 (agreed 2026-10-19): the author's own Gemini key for (1) testing in Settings and (2) one golden-set run on a Gemini model for a Claude vs Gemini table in the README. Key lives in `.env` (gitignored), never in chat. Confirm with her right before the paid run.
