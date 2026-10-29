"""Engine API: POST /api/evaluate turns one recipe into a Meal result (packs, macros, leftovers in code).

Request and reply follow docs/contracts/evaluate.schema.json; both are checked. No model call happens here and no
API key is ever sent to this server. Local run (port 8100):

    .venv/bin/uvicorn api.index:app --host 127.0.0.1 --port 8100
"""
import json
import logging
import sys
import traceback
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # repo root, so smartbite_engine imports on Vercel

from smartbite_engine.contracts import validate_output  # noqa: E402
from smartbite_engine.generic_packs import load_packs  # noqa: E402
from smartbite_engine.meal import evaluate, product_errors  # noqa: E402
from smartbite_engine.nutrition import load_table  # noqa: E402

CONTRACT = "evaluate.schema.json"
MAX_BODY_BYTES = 200_000

app = FastAPI(title="SmartBite engine", docs_url=None, redoc_url=None, openapi_url=None)

log = logging.getLogger("smartbite.engine")
if not log.handlers:  # one JSON line per error on stderr (uvicorn and Vercel keep it)
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False


def _log_error(event, **fields):
    """One JSON line: an id to quote, the event and safe fields only. Never the request body, its values, any
    header or key: exception messages can quote input, so only the exception type and code locations are kept."""
    error_id = uuid.uuid4().hex[:12]
    log.error(json.dumps({"level": "error", "event": event, "error_id": error_id, **fields}, sort_keys=True))
    return error_id


def _where(exc):
    """file:line function of each frame, innermost last; no locals, no message."""
    return [f"{Path(f.filename).name}:{f.lineno} {f.name}" for f in traceback.extract_tb(exc.__traceback__)][-6:]


@lru_cache(maxsize=1)
def _data():
    return load_table(), load_packs()


def _error(status, errors):
    return JSONResponse({"errors": errors}, status_code=status)


# JSON only: nothing here may be framed, sniffed as another type or run as a page
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/evaluate")
async def evaluate_meal(request: Request):
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        return _error(413, [f"request body is over {MAX_BODY_BYTES} bytes"])
    try:
        body = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return _error(422, [f"request body is not valid JSON: {e}"])
    errors = validate_output(body, CONTRACT, "Input") or product_errors(body.get("products"))
    if not errors and body.get("region") and not body.get("country"):
        errors = ["region: needs country"]
    if errors:
        return _error(422, errors)
    shape = {"body_bytes": len(raw), "servings": body["form"].get("servings"),
             "ingredients": len(body["recipe"]["ingredients"]), "products": len(body.get("products") or []),
             "country": body.get("country"), "region": body.get("region")}
    try:
        table, packs = _data()
        meal = evaluate(body["form"], body["picked_idea"], body["recipe"], body.get("profile"),
                        country=body.get("country"), products=body.get("products") or None,
                        region=body.get("region"), table=table, packs=packs)
    except ValueError as e:  # form rules the schema cannot express
        return _error(422, [f"form: {e}"])
    except Exception as e:  # a bug: logged without the body, answered as JSON the site can show
        error_id = _log_error("evaluate_failed", error=type(e).__name__, where=_where(e), **shape)
        return _error(500, [f"the meal engine failed (error id {error_id})"])
    out_errors = validate_output(meal, CONTRACT, "Output")
    if out_errors:
        # Field paths only: the messages after ":" can quote values
        _log_error("reply_off_contract", fields=[e.split(":")[0] for e in out_errors][:10], count=len(out_errors), **shape)
        return _error(500, ["engine reply does not match the contract", *out_errors])
    return meal
