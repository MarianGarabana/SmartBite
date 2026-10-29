# Contributing

Thanks for looking at SmartBite. Bug reports, ideas and small pull requests are all welcome.

## Before you start

- For a bug or an idea, open an issue with one of the forms first. For a security problem, follow [SECURITY.md](SECURITY.md) instead.
- For anything larger than a small fix, describe the change in an issue before you write it, so we can agree on it first.
- Changes to the look (colors, fonts, spacing, layout) are decided by the maintainer. Open an issue with a screenshot if you think something should change.

## Run it and test it

Setup is in the README under [Run locally](README.md#run-locally). Before you open a pull request, run:

```bash
.venv/bin/python -m pytest -q          # engine tests
cd web
npm test                               # unit tests
npm run build                          # the site builds
npm run e2e                            # browser tests; needs the engine (8100) and the dev server (3100) running
```

Add a test for each bug you fix or feature you add.

## Project rules

- **The model picks foods and grams. All math is code.** Macros, packs, leftovers and prices are computed in Python or JavaScript with tests, never by the model.
- **No API keys in the repo.** Users bring their own key and it stays in their browser. Test fixtures use fake keys.
- **No accounts and no server storage.** Profiles, carts and meals live in the user's browser.
- **Requests to outside services** send `User-Agent: SmartBite` and no personal data.
- **Data licenses.** Data files keep their own licenses (see [Data and licenses](README.md#data-and-licenses)). A file built from Open Food Facts data is ODbL 1.0 and goes in a folder with its own LICENSE and source note.

## License

By sending a pull request you agree that your code is released under the project's [AGPL-3.0](LICENSE) license.
