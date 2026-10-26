# SmartBite (open version)

One meal in. One recipe in grams, a shopping list in whole packs, real macros and leftovers that fit into servings.
Public, open-source version of Marian's personal SmartBite. Plan and phases: `PLAN.md`.

## What never goes in this repo

- No personal data: no email, city, own recipes (`recipes.md`), cart history. Marian's name appears only as author in the README (decided 2026-10-19).
- Exception (decided 2026-10-19): Marian's 13 saved meals and their Gemini photos ship as demo meals, with all store data removed and macros and packs recomputed by this engine. Photos carry an "AI-generated photo" label.
- No Alcampo or other store data (product names, prices, links, labels, EANs collected from store pages). No scrapers.
- No BEDCA values (AESAN terms forbid non-personal electronic use without written permission).
- No API keys. Users bring their own key; it stays in their browser. Providers: Anthropic (tested) and any OpenAI-compatible endpoint (OpenAI, OpenRouter, Gemini, Ollama), labeled "experimental: tested with two Gemini models".
- Small hand-made test fixtures are fine (fake links like `https://x/...`).

## Data and licenses

- Code: AGPL-3.0 (`LICENSE`).
- Nutrition: Ciqual 2025 (Etalab 2.0, cite "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual.") and USDA FoodData Central (CC0). Branded products: Open Food Facts by barcode.
- Any file built from Open Food Facts data is ODbL 1.0 and sits in a folder with its own LICENSE and source note.
- Raw downloads go to `data/raw/` (gitignored). Build scripts in `data/build/` make the files in `data/open/`.
- Requests to third parties send `User-Agent: SmartBite` only, until the project email exists (then `SmartBite/<version> (<project email>)`). Never a personal email.

## Hard rules

- The LLM picks foods and grams only. All math (macros, packs, cost, leftovers) is code.
- Rice, pasta, quinoa and couscous in dry grams. Eggs in units (S 42, M 51, L 60, XL 69 g edible).
- Design: same look as the personal SmartBite mockup (forest `#0f2d24`, lime `#70e000`, cream `#f9f8f3`, Playfair Display, Caveat, Plus Jakarta Sans). Look changes only come from Marian.
- Profiles live in the browser (localStorage). No accounts, no server storage of health data. A profile file (decided 2026-10-22) is made and opened in the browser, never uploaded; API keys go in it only when the user ticks "include my key".
- Label ideas and recipes as AI-generated in the UI.
- Never push, create a remote, or change visibility without asking Marian. Local commits only when she asks.

## Done check

`.venv/bin/python -m pytest -q` must pass. Web changes: also `cd web && npm run build`.
