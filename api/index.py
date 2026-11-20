"""Engine API: POST /api/evaluate turns one recipe into a Meal result (packs, macros, leftovers in code).

Request and reply follow docs/contracts/evaluate.schema.json; both are checked. No model call happens in /api/evaluate
and no user's API key is ever sent to this server. The free trial (GET/POST /api/trial, smartbite_engine/trial.py) is
the one route that calls a model: with Marian's key from env SMARTBITE_TRIAL_KEY, for SmartBite's own steps only.
Local run (port 8100):

    .venv/bin/uvicorn api.index:app --host 127.0.0.1 --port 8100
"""
import json
import logging
import os
import sys
import time
import traceback
import uuid
from collections import defaultdict, deque
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # repo root, so smartbite_engine imports on Vercel

from smartbite_engine.contracts import validate_output  # noqa: E402
from smartbite_engine.generic_packs import load_packs  # noqa: E402
from smartbite_engine.meal import evaluate, product_errors  # noqa: E402
from smartbite_engine.nutrition import load_table  # noqa: E402
from smartbite_engine import trial  # noqa: E402

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


# ---------------------------------------------------------------- free trial

TRIAL_KEY_ENV = "SMARTBITE_TRIAL_KEY"
TRIAL_MAX_BODY = 60_000  # bytes; the site's largest trial request (a rerun) is far below
TRIAL_CALLS_PER_HOUR = 40  # per IP and server instance; 3 meals take about 6 to 25 calls
# Spend limits Anthropic answers with 429 (RateLimitError) that are not "busy": the money cap was reached
SPEND_LIMIT_CODES = {"enforced_spend_limit_reached", "contract_spend_limit_reached"}
USED_UP = "The free meals have run out for now. Add your own AI key to keep making meals."
BUSY = "The AI provider is busy right now. Wait a minute and try again."
_trial_calls = defaultdict(deque)


@lru_cache(maxsize=1)
def _trial_client():
    """Anthropic client for the trial key, or None when the key is not set (the trial is then off)."""
    key = os.environ.get(TRIAL_KEY_ENV, "").strip()
    if not key:
        return None
    import anthropic  # only the trial needs the SDK

    # No SDK retries: a retry could outlast the request's deadline (trial.DEADLINE_S); the site offers Try again
    return anthropic.Anthropic(api_key=key, max_retries=0, default_headers={"User-Agent": "SmartBite"})


def _client_ip(request):
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() or request.headers.get("x-real-ip")
            or (request.client.host if request.client else "unknown"))


def _over_limit(ip, now=None):
    """True when this IP made TRIAL_CALLS_PER_HOUR trial requests in the last hour on this instance (a soft guard;
    the prepaid balance is the hard cap)."""
    now = time.monotonic() if now is None else now
    calls = _trial_calls[ip]
    while calls and now - calls[0] > 3600:
        calls.popleft()
    if len(calls) >= TRIAL_CALLS_PER_HOUR:
        return True
    calls.append(now)
    return False


def _trial_call(client):
    """call(step, system, messages, timeout_s) for trial.run: one Messages API call with the browser's settings."""
    import anthropic

    def used_up(e):
        _log_error("trial_used_up", status=e.status_code, type=e.type, code=e.error_code)  # the owner sees it in logs
        return trial.TrialError(503, "trial_used_up", USED_UP)

    def call(step, system, messages, timeout_s):
        start = time.monotonic()
        try:
            res = client.with_options(timeout=timeout_s).messages.create(
                model=trial.MODEL, max_tokens=trial.MAX_TOKENS, system=system, messages=messages,
                output_config={"effort": trial.EFFORT[step]})
        except anthropic.AuthenticationError as e:
            _log_error("trial_key_rejected", status=e.status_code)
            raise trial.TrialError(503, "trial_off", "Free meals are not available right now.") from e
        except anthropic.PaymentRequiredError as e:  # 402 billing_error: the prepaid balance is used up
            raise used_up(e) from e
        except anthropic.RateLimitError as e:
            if e.error_code in SPEND_LIMIT_CODES:
                raise used_up(e) from e
            raise trial.TrialError(503, "busy", BUSY) from e
        except anthropic.APITimeoutError as e:  # before APIConnectionError, its parent class
            raise trial.TrialError(504, "too_slow", "The AI provider took too long. Try again.") from e
        except anthropic.APIConnectionError as e:
            raise trial.TrialError(503, "busy", BUSY) from e
        except anthropic.APIStatusError as e:
            # billing_error by type; the "credit balance" text only as a fallback for other error shapes
            if e.type == "billing_error" or "credit balance" in str(e.api_message or "").lower():
                raise used_up(e) from e
            if e.status_code >= 500:
                raise trial.TrialError(503, "busy", BUSY) from e
            _log_error("trial_provider_error", step=step, status=e.status_code, type=e.type)
            raise trial.TrialError(502, "provider_error", "The AI provider could not answer. Try again.") from e
        usage = res.usage
        log.info(json.dumps({"level": "info", "event": "trial_call", "step": step, "model": trial.MODEL,
                             "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
                             "stop_reason": res.stop_reason, "latency_s": round(time.monotonic() - start, 2)},
                            sort_keys=True))
        if res.stop_reason == "refusal":
            raise trial.TrialError(422, "declined", "The model declined this request. Try a different craving or change.")
        if res.stop_reason == "max_tokens":
            raise trial.TrialError(502, "cut_off", "The reply was cut off before it ended. Try again.")
        content = [block.to_dict() for block in res.content]
        return "".join(b.text for b in res.content if b.type == "text"), content

    return call


@app.get("/api/trial")
def trial_status():
    """Is the free trial on? The site offers it only then."""
    return {"available": _trial_client() is not None, "meals": trial.MEALS, "model": trial.MODEL}


@app.post("/api/trial")
async def trial_step(request: Request):
    client = _trial_client()
    if client is None:
        return JSONResponse({"errors": ["Free meals are not available right now."], "code": "trial_off"},
                            status_code=503)
    raw = await request.body()
    if len(raw) > TRIAL_MAX_BODY:
        return _error(413, [f"request body is over {TRIAL_MAX_BODY} bytes"])
    try:
        body = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return _error(422, [f"request body is not valid JSON: {e}"])
    if _over_limit(_client_ip(request)):
        message = "Too many free-meal requests from your network. Try again in an hour, or add your own AI key."
        return JSONResponse({"errors": [message], "code": "rate_limited"}, status_code=429)
    try:
        _, packs = _data()
        data = await run_in_threadpool(trial.run, body, _trial_call(client), packs)
    except trial.TrialError as e:
        return JSONResponse({"errors": [e.message], "code": e.code}, status_code=e.status)
    except Exception as e:  # a bug: logged without the body
        error_id = _log_error("trial_failed", error=type(e).__name__, where=_where(e))
        return _error(500, [f"the free trial failed (error id {error_id})"])
    return {"data": data}
