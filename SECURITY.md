# Security

## Report a problem privately

Use GitHub's private reporting: open the **Security** tab of this repository and click **Report a vulnerability**. Please do not open a public issue for a security problem.

Never paste a real API key in a report. A fake key such as `sk-test-123` is enough to show the problem.

SmartBite is a one-person open-source project, so replies can take a few days.

## What is in scope

- **API key handling.** Your key is kept in your browser (localStorage) and sent only to the model provider you picked. Any way the key could reach the SmartBite engine, the logs, another site or another user is a security bug.
- **The hosted site's browser rules.** The Content Security Policy and the endpoint list in `web/lib/providers.js` limit where the browser may send requests. A way around them is in scope.
- **The meal engine** (`api/index.py`, `/api/evaluate`). It should keep nothing and log no request content. A crash that logs request content, a way to make it read or write files, or a way to make it call other servers is in scope.
- **Profile files.** A profile file opened in SmartBite should never run code or send data anywhere.

## Out of scope

- The security of the model providers themselves (Anthropic, OpenAI, OpenRouter, Google) and of Vercel's hosting.
- Sending many requests to slow the site down. Volume is handled by the host's rate limits.
- Anything that needs someone else's unlocked browser, or a key the reporter already has.

## Versions

Only the live site (https://smartbite-steel.vercel.app) and the `main` branch get fixes.
