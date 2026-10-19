# Deploy: engine API next to the web app

The engine (`smartbite_engine`) runs as a FastAPI app in `api/index.py` with two routes:

- `POST /api/evaluate`: request and reply per `docs/contracts/evaluate.schema.json`. Both are checked; a bad
  request gets `422` with `{"errors": [...]}`. No model call and no API key reach this server.
- `GET /api/health`: `{"status": "ok"}`.

## Layout chosen: Vercel Services, one project, Root Directory at the repo root

```
vercel.json          services "engine" (root ./, FastAPI) and "web" (root web/, Next.js), public rewrites
api/index.py         FastAPI app (entrypoint api.index:app); reads smartbite_engine, data/open, docs/contracts
requirements.txt     pinned runtime packages (FastAPI and its dependencies)
pyproject.toml       must list the same runtime dependency (see "Needed change" below)
web/                 Next.js app, unchanged
```

`vercel.json` routes `/api/evaluate` and `/api/health` to the engine and every other path to the web app. The
engine receives the full path (`/api/evaluate`, not `/evaluate`), so the FastAPI routes keep the `/api` prefix.
`excludeFiles` keeps `web/`, `tests/`, `eval/`, `data/raw/` and `data/build/` out of the Python bundle.

Why this layout:

- The engine reads files at the repo root (`smartbite_engine/`, `data/open/`, `docs/contracts/`), while the web
  app has its own root `web/`. A Python function inside `web/` could not see those files, and a separate Vercel
  project would need its own domain and CORS. Services put both on one domain with one `vercel.json`.
- The older file-based `/api` folder only works at the project root, and the Next.js app is not at the root.
- In the Vercel dashboard, keep **Root Directory** at the repository root (not `web/`) so Vercel finds both
  services.

Sources (read 2026-10-19):

- Services, availability "Beta, all plans", `services` + `rewrites` format, `vercel dev -L`:
  https://vercel.com/docs/services
- The service receives the original request path: https://vercel.com/docs/services/routing
- Service fields (`root`, `entrypoint` as `module:variable`, `functions`): https://vercel.com/docs/services/config-reference
- Python runtime (versions 3.12 default, 3.13, 3.14; dependencies from `pyproject.toml`, `requirements.txt` or
  `Pipfile`; `excludeFiles`; working directory is the project base): https://vercel.com/docs/functions/runtimes/python
- FastAPI on Vercel: https://vercel.com/docs/frameworks/backend/fastapi
- "Keep Root Directory at the repository root": https://vercel.com/kb/guide/python-backend-on-vercel

## pyproject.toml for Vercel (applied 2026-10-19)

The change below is now in `pyproject.toml`. Tested with Vercel CLI 54.18.6 (`vercel dev -L`, engine service only, in a scratch copy of the repo): when a
`pyproject.toml` sits at the service root, Vercel installs dependencies from it and ignores `requirements.txt`.
With the current `pyproject.toml` the install fails in two ways:

1. `pip install .` stops with "Multiple top-level packages discovered in a flat-layout" (setuptools finds `api`,
   `eval`, `data`, `prompts`, `smartbite_engine`).
2. With that fixed, `dependencies = []` means FastAPI is never installed (`ModuleNotFoundError: fastapi`).

With both lines below, the same test answered `GET /api/health` with 200 and `POST /api/evaluate` with 200 and the
same evaluation as the stored demo meal:

```toml
[project]
dependencies = ["fastapi==0.147.0"]

[tool.setuptools]
packages = ["smartbite_engine"]
```

Keep the FastAPI pin in `pyproject.toml` equal to the one in `requirements.txt`.

Not tested: a full `vercel dev` with the web service too (it starts its own Next.js dev server, and the web app is
owned by another agent right now), and a real deploy.

## Local development

Engine on port 8100 (never 3000, 3100 or 3101):

```bash
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/uvicorn api.index:app --host 127.0.0.1 --port 8100
curl http://127.0.0.1:8100/api/health
```

The Next.js dev server (port 3100) needs a rewrite so the browser's `fetch("/api/evaluate")` reaches the engine.
Add to `web/next.config.mjs`, inside `nextConfig`, for development only (on Vercel the `vercel.json` rewrites send
`/api/evaluate` to the engine before Next.js sees it):

```js
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/evaluate", destination: "http://127.0.0.1:8100/api/evaluate" },
      { source: "/api/health", destination: "http://127.0.0.1:8100/api/health" },
    ];
  },
```

Format from the Next.js 16 docs shipped in `web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md`
("Rewriting to an external URL").

Or run both services as on Vercel with `vercel dev -L --listen 127.0.0.1:8102` from the repo root.
