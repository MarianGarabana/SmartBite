"""Live eval run: the golden cravings through a real model, the same way the browser does it. Paid: run it only
after Marian confirms. Standard library only (urllib), no SDK.

    .venv/bin/python -m eval.live --provider anthropic|gemini --run <name> [--model <id>] [--cases c01,c02] [--dry-run]
        [--max-usd 2.00] [--min-gap <seconds>]

Per case, like web/lib/flow.js and web/lib/llm.js: ideas -> pick the first idea -> recipe -> meal.evaluate -> up to 2
reruns while code finds macro misses or high_leftover lines, then the attempt with the fewest problems is kept (a tie
goes to the later one). Every reply is checked against docs/contracts (plus the browser's extra checks); on a failure
the model gets the error list once and replies again. A second failure ends that stage, as in the browser.

Prompts come from smartbite_engine.prompts with the browser's inputs: the default Kitchen Profile, 12 inspiration
dishes (seeded with the case id, as eval.run does), the English food keys (names.foods, the browser's foods()), pack
hints for pack_hint_foods, and the engine with country "ES" (the browser's default country).

Writes eval/replies/<run>/<case id>.json (the format eval.run scores: `python -m eval.run score <run>`; extra fields
"kept_attempt" and "attempts" say which recipe the browser would show, since the score checks the last one),
eval/results/<run>-usage.json (every call) and eval/results/<run>-usage.md (summary).

Safety: keys only from <repo>/.env (ANTHROPIC_API_KEY or GEMINI_API_KEY), never printed or written; the run refuses
to start when .env is missing, lacks the key, is tracked by git or is not ignored by .gitignore. Before each call the
worst case of that call (input estimated high, output at its cap) is added to the money spent so far; if that passes
--max-usd the run stops. At most 4 model calls per case. Requests carry only the prompt, the model settings and
`User-Agent: SmartBite`. --dry-run builds every prompt and prints the call count and cost estimate, with no network
call and no key.
"""
import argparse
import json
import math
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from smartbite_engine.contracts import parse_reply, validate_output
from smartbite_engine.generic_packs import load_packs
from smartbite_engine.inspiration import pick_dishes
from smartbite_engine.meal import evaluate
from smartbite_engine.names import foods
from smartbite_engine.prompts import (MAX_ATTEMPTS, idea_prompt, pack_hint_foods, pack_hints_for, recipe_prompt,
                                      rerun_info)

from .checks import missing_main_foods
from .run import load_cases

ROOT = Path(__file__).resolve().parents[1]
EVAL = ROOT / "eval"
REPLIES = EVAL / "replies"
RESULTS = EVAL / "results"
USER_AGENT = "SmartBite"
TIMEOUT_S = 600

# Same settings as web/lib/llm.js and web/lib/providers.js (tests/test_eval_live.py checks they still match)
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
MAX_TOKENS = 16000
EFFORT = {"ideas": "low", "revision": "low", "recipe": "medium"}
GEMINI_EFFORT = {"ideas": "low", "revision": "low"}  # reasoning_effort; the recipe keeps Gemini's default
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
COUNTRY = "ES"  # web/lib/store.js DEFAULT_COUNTRY

PROVIDERS = {
    "anthropic": {"model": "claude-sonnet-5-5", "models": ("claude-sonnet-5-5", "claude-haiku-5-5"),
                  "env_key": "ANTHROPIC_API_KEY", "url": ANTHROPIC_URL,
                  # the browser sends max_tokens 16000, so no reply is longer
                  "max_output_tokens": MAX_TOKENS},
    "gemini": {"model": "gemini-3.6-flash", "models": ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"),
               "env_key": "GEMINI_API_KEY", "url": f"{GEMINI_BASE_URL}/chat/completions",
               # the browser sends no max_tokens: the model's own output limit, 65,536
               # (https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash, page updated 2026-09-02, read 2026-10-19;
               # gemini-3.5-flash-lite: outputTokenLimit 65536 in the API's models list, read 2026-10-26;
               # gemini-3.6-flash: outputTokenLimit 65536 in the API's models list, read 2026-10-27)
               "max_output_tokens": 65536},
}

# USD per million tokens. Each entry names its source and the date it was read.
PRICES = {
    # Claude Sonnet 5.5: input $2, output $10, cache reads $0.20. Source: claude-api skill model table (cached
    # 2026-10-06; live page https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-19. Cache write
    # (5-minute TTL) is 1.25x input per the skill's prompt-caching guide. The browser sets no cache_control, so cache
    # tokens should stay 0.
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_write": 2.50, "cache_read": 0.20,
                          "source": "claude-api skill (cached 2026-10-06), read 2026-10-19", "valid_until": None},
    # Claude Haiku 5.5: input $0.10, output $0.50 for prompts up to 100K tokens ($0.50 / $2.50 above; SmartBite
    # prompts are far below). Same source. Cache read (0.1x) and write (1.25x) are the skill's general multipliers,
    # not a listed Haiku 5.5 price: unconfirmed. Not used by the two planned runs.
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50, "cache_write": 0.125, "cache_read": 0.01,
                         "source": "claude-api skill (cached 2026-10-06), read 2026-10-19; cache prices derived",
                         "valid_until": None},
    # gemini-3.8-flash, paid tier Standard: input $0.75, output (thinking included) $3.75, context caching $0.075
    # through 2026-12-31; from 2027-01-01 $1.50 / $7.50 / $0.15. Source: https://ai.google.dev/gemini-api/docs/pricing
    # (page "Last updated 2026-10-16 UTC"), read 2026-10-19. No prompt-size tiers listed. A live run refuses to
    # start after valid_until, so the doubled prices are never missed.
    "gemini-3.8-flash": {"input": 0.75, "output": 3.75, "cache_write": None, "cache_read": 0.075,
                         "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-16), read 2026-10-19",
                         "valid_until": "2026-12-31"},
    # gemini-3.5-flash-lite, paid tier Standard: input $0.30, output (thinking included) $2.50, context caching $0.03.
    # No end date listed. Source: https://ai.google.dev/gemini-api/docs/pricing (page "Last updated 2026-10-22 UTC"),
    # read 2026-10-26. No prompt-size tiers listed.
    "gemini-3.5-flash-lite": {"input": 0.30, "output": 2.50, "cache_write": None, "cache_read": 0.03,
                              "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-22), read 2026-10-26",
                              "valid_until": None},
    # gemini-3.6-flash, paid tier Standard: input $0.75, output (thinking included) $3.75, context caching $0.075
    # through 2026-12-31; from 2027-01-01 $1.50 / $7.50 / $0.15. Source: https://ai.google.dev/gemini-api/docs/pricing
    # (page "Last updated 2026-10-27 UTC"), read 2026-10-27. No prompt-size tiers listed.
    "gemini-3.6-flash": {"input": 0.75, "output": 3.75, "cache_write": None, "cache_read": 0.075,
                         "source": "https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-27), read 2026-10-27",
                         "valid_until": "2026-12-31"},
}

MAX_CALLS_PER_CASE = 4
WORST_BYTES_PER_TOKEN = 2  # spend guard: count input high (real text runs about 3.5 to 4 characters per token)
CHARS_PER_TOKEN = 3.5  # dry-run expected estimate
# Dry-run assumption, not measured: hidden thinking tokens per call on top of the visible reply
THINKING_ALLOWANCE = {"ideas": 2000, "recipe": 4000}
REFERENCE_RUNS = ("v3", "v2", "baseline")  # stored replies used by the dry run for recipe and rerun prompt sizes
LABEL = {"ideas": "ideas", "recipe": "recipe"}


class LiveError(Exception):
    """A problem that stops the run before or during it (setup, auth)."""


class SpendLimit(LiveError):
    pass


class CallFailed(Exception):
    """One stage failed: reply invalid twice, refused, cut off, or an HTTP error. text: the last reply text."""

    def __init__(self, message, text=None):
        super().__init__(message)
        self.text = text


class CaseCallLimit(CallFailed):
    pass


# ---------------------------------------------------------------- .env

def read_env(path):
    """KEY=VALUE lines; # comments, blank lines and an "export " prefix allowed; matching quotes stripped."""
    values = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        s = s.removeprefix("export ")
        name, sep, value = s.partition("=")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[name.strip()] = value
    return values


def _git(root, *args):
    try:
        return subprocess.run(["git", "-C", str(root), *args], check=False, capture_output=True, text=True).returncode
    except OSError:
        return None


def env_problem(root):
    """Why <root>/.env is not safe to use, or None. Checks: exists, not tracked by git, ignored by .gitignore."""
    path = Path(root) / ".env"
    if not path.is_file():
        return f"no .env file at {path}"
    if _git(root, "ls-files", "--error-unmatch", "--", ".env") == 0:
        return ".env is tracked by git: remove it from the index (git rm --cached .env) before a live run"
    ignored = _git(root, "check-ignore", "-q", "--", ".env")
    if ignored != 0:
        return (".env is not ignored by git (.gitignore must cover it)" if ignored == 1
                else "could not check .env with git (is this a git repo?)")
    return None


def load_key(root, env_key):
    """The key from <root>/.env. Raises LiveError (with no key text) when .env is unsafe or the key is missing."""
    problem = env_problem(root)
    if problem:
        raise LiveError(f"refusing to start: {problem}")
    key = read_env(Path(root) / ".env").get(env_key, "").strip()
    if not key:
        raise LiveError(f"refusing to start: .env has no {env_key}")
    return key


def redact(text, key):
    out = str(text or "")
    if key:
        out = out.replace(key, "[key]")
    return re.sub(r"\b(sk-|AIza)[A-Za-z0-9_\-*.]{4,}", "[key]", out)


# ---------------------------------------------------------------- requests and usage

def build_request(provider, model, key, step, system, messages):
    """(url, headers, body) for one call, the same body the browser sends."""
    if provider == "anthropic":
        headers = {"content-type": "application/json", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION,
                   "user-agent": USER_AGENT}
        body = {"model": model, "max_tokens": MAX_TOKENS, "system": system, "messages": messages,
                "output_config": {"effort": EFFORT[step]}}
        return ANTHROPIC_URL, headers, body
    headers = {"content-type": "application/json", "authorization": f"Bearer {key}", "user-agent": USER_AGENT}
    body = {"model": model, "messages": [{"role": "system", "content": system}, *messages],
            "response_format": {"type": "json_object"}}
    if step in GEMINI_EFFORT:
        body["reasoning_effort"] = GEMINI_EFFORT[step]
    return PROVIDERS[provider]["url"], headers, body


def _int(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def parse_usage(provider, data):
    """Billed tokens from the response usage: input (uncached), output, cache_write, cache_read, and reasoning
    (Gemini only, for the record). Gemini: output is the larger of completion_tokens and total - prompt, so thinking
    is billed whether or not the endpoint counts it inside completion_tokens."""
    usage = (data or {}).get("usage") or {}
    if provider == "anthropic":
        return {"input_tokens": _int(usage.get("input_tokens")), "output_tokens": _int(usage.get("output_tokens")),
                "cache_write_tokens": _int(usage.get("cache_creation_input_tokens")),
                "cache_read_tokens": _int(usage.get("cache_read_input_tokens")), "reasoning_tokens": None}
    prompt, completion, total = (_int(usage.get(k)) for k in ("prompt_tokens", "completion_tokens", "total_tokens"))
    cached = _int((usage.get("prompt_tokens_details") or {}).get("cached_tokens"))
    reasoning = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
    return {"input_tokens": max(prompt - cached, 0), "output_tokens": max(completion, total - prompt),
            "cache_write_tokens": 0, "cache_read_tokens": cached,
            "reasoning_tokens": _int(reasoning) if reasoning is not None else None}


def cost_usd(model, usage):
    p = PRICES[model]
    out = (usage["input_tokens"] * p["input"] + usage["output_tokens"] * p["output"]
           + usage["cache_read_tokens"] * p["cache_read"]
           + usage["cache_write_tokens"] * (p["cache_write"] if p["cache_write"] is not None else p["input"]))
    return out / 1e6


def worst_case_usd(provider, model, system, messages, prior_output_tokens=0):
    """Highest cost one call can have: input counted high (2 bytes per token, plus earlier output tokens sent back,
    thinking included) at the input price, output at the call's cap."""
    size = len(json.dumps({"system": system, "messages": messages}, ensure_ascii=False).encode("utf-8"))
    input_tokens = math.ceil(size / WORST_BYTES_PER_TOKEN) + prior_output_tokens
    p = PRICES[model]
    return (input_tokens * p["input"] + PROVIDERS[provider]["max_output_tokens"] * p["output"]) / 1e6


def parse_reply_body(provider, data):
    """(text, assistant turn for a retry, error or None) from a 200 response."""
    if provider == "anthropic":
        content = data.get("content") if isinstance(data.get("content"), list) else []
        text = "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
        error = {"refusal": "the model declined this request", "max_tokens": "the reply was cut off (max_tokens)"}
        return text, {"role": "assistant", "content": content}, error.get(data.get("stop_reason"))
    choice = (data.get("choices") or [{}])[0] or {}
    content = (choice.get("message") or {}).get("content")
    text = content if isinstance(content, str) else ""
    error = "the reply was cut off (finish_reason length)" if choice.get("finish_reason") == "length" else None
    return text, {"role": "assistant", "content": text}, error


def urllib_transport(url, headers, body, timeout=TIMEOUT_S):
    """POST JSON bytes; (status, response bytes). The only function that touches the network."""
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def retry_message(errors):
    """Same text as retryMessage in web/lib/llm.js."""
    return ("Your reply did not pass the checks:\n" + "\n".join(f"- {e}" for e in errors)
            + "\n\nReply again with ONLY the corrected JSON object, no other text.")


def ideas_errors(data):
    errors = validate_output(data, "idea.schema.json")
    if not errors:
        ids = [i["idea_id"] for i in data["ideas"]]
        if len(set(ids)) != len(ids):
            errors.append(f"idea_id values must all be different, got {', '.join(ids)}")
    return errors


def recipe_errors(recipe, idea, form):
    """Same checks as writeRecipe in web/lib/llm.js."""
    errors = validate_output(recipe, "recipe.schema.json")
    if errors:
        return errors
    if recipe["idea_id"] != idea["idea_id"]:
        errors.append(f'idea_id must be "{idea["idea_id"]}", the picked idea "{idea["name"]}"; got '
                      f'{json.dumps(recipe.get("idea_id"))}. Write the recipe for that idea.')
    if recipe["servings"] != form["servings"]:
        errors.append(f"servings must be {form['servings']}, got {recipe['servings']}")
    missing = missing_main_foods(idea, recipe["ingredients"])
    if missing:
        errors.append(f"the recipe dropped main ingredients of the picked idea: {', '.join(missing)}. Keep every food "
                      f"in main_ingredients ({', '.join(idea['main_ingredients'])}); change grams or other foods instead.")
    return errors


def problem_count(meal):
    """Same as problemCount in web/lib/flow.js: macro misses plus high_leftover lines."""
    ev = meal.get("evaluation") or {}
    misses = len((ev.get("macros") or {}).get("misses") or [])
    return misses + sum(1 for r in ev.get("change_requests") or [] if r.get("reason") == "high_leftover")


def best_attempt(attempts):
    """Same as bestAttempt in web/lib/flow.js: fewest problems, a tie goes to the later attempt."""
    best = None
    for a in attempts:
        if a.get("problems") is not None and (best is None or a["problems"] <= best["problems"]):
            best = a
    return best


# ---------------------------------------------------------------- runner

@dataclass
class Runner:
    provider: str
    key: str
    max_usd: float
    transport: object = urllib_transport
    model: str = None
    clock: object = time.monotonic
    log: object = print
    country: str = COUNTRY
    table: dict = None
    packs: dict = None
    calls: list = field(default_factory=list)
    spent: float = 0.0
    min_gap_s: float = 0.0  # seconds between call starts, for per-minute rate limits (15 a minute -> 4 s or more)
    sleep: object = time.sleep
    last_start: float = None

    def __post_init__(self):
        self.model = self.model or PROVIDERS[self.provider]["model"]
        self.packs = load_packs() if self.packs is None else self.packs

    def call(self, case, stage, attempt, try_no, step, system, messages, budget):
        """One model call. budget: {"calls": n} for this case. Records usage and cost; returns (text, assistant)."""
        if budget["calls"] >= MAX_CALLS_PER_CASE:
            raise CaseCallLimit(f"{MAX_CALLS_PER_CASE} model calls used for this case")
        prior = sum(c["output_tokens"] for c in budget.get("conversation", []))
        worst = worst_case_usd(self.provider, self.model, system, messages, prior)
        if self.spent + worst > self.max_usd:
            raise SpendLimit(f"stopped before {case} {stage} attempt {attempt}: spent ${self.spent:.4f}, this call "
                             f"could cost up to ${worst:.4f}, limit ${self.max_usd:.2f}")
        budget["calls"] += 1
        url, headers, body = build_request(self.provider, self.model, self.key, step, system, messages)
        if self.min_gap_s and self.last_start is not None:
            wait = self.last_start + self.min_gap_s - self.clock()
            if wait > 0:
                self.sleep(wait)
        start = self.last_start = self.clock()
        try:
            status, raw = self.transport(url, headers, json.dumps(body, ensure_ascii=False).encode("utf-8"))
        except Exception as e:  # connection problems: record, no tokens billed
            status, raw = None, redact(str(e), self.key).encode("utf-8")
        latency = self.clock() - start
        try:
            data = json.loads(raw.decode("utf-8")) if raw else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            data = None
        ok = status == 200 and isinstance(data, dict)
        usage = parse_usage(self.provider, data if ok else None)
        cost = cost_usd(self.model, usage)
        self.spent += cost
        record = {"case": case, "stage": stage, "attempt": attempt, "try": try_no, "model": self.model,
                  "status": status, **usage, "latency_s": round(latency, 3), "cost_usd": round(cost, 6), "error": None}
        self.calls.append(record)
        if not ok:
            detail = ""
            if isinstance(data, list) and data and isinstance(data[0], dict):  # Gemini wraps errors in a list
                data = data[0]
            if isinstance(data, dict):
                err = data.get("error")
                detail = (err.get("message") if isinstance(err, dict) else err) or data.get("message") or ""
            elif status is None:
                detail = raw.decode("utf-8", "replace")
            record["error"] = redact(f"HTTP {status}: {detail}".strip(), self.key)[:300]
            self.log(f"  {case} {stage} {attempt}.{try_no}: {record['error']}")
            if status in (401, 403, 404):
                raise LiveError(f"provider refused the request ({status}); check the key and model. {record['error']}")
            raise CallFailed(record["error"])
        text, assistant, error = parse_reply_body(self.provider, data)
        record["error"] = error
        budget.setdefault("conversation", []).append(record)
        self.log(f"  {case} {stage} {attempt}.{try_no}: {usage['input_tokens']} in, {usage['output_tokens']} out, "
                 f"{latency:.1f} s, ${cost:.4f} (total ${self.spent:.4f})")
        if error:
            raise CallFailed(error, text)
        return text, assistant

    def ask_json(self, case, stage, attempt, step, prompt, check, budget):
        """Ask, check, and on a failure send the errors back once (askJson in web/lib/llm.js). (data, reply text)."""
        messages = [{"role": "user", "content": prompt["user"]}]
        budget["conversation"] = []
        for try_no in (1, 2):
            text, assistant = self.call(case, stage, attempt, try_no, step, prompt["system"], messages, budget)
            data, errors = parse_reply(text)
            if not errors:
                errors = check(data)
            if not errors:
                return data, text
            self.calls[-1]["contract_errors"] = errors[:5]
            if try_no == 2:
                raise CallFailed(f"the {LABEL[step]} reply was not valid twice: {'; '.join(errors[:5])}", text)
            messages = [*messages, assistant, {"role": "user", "content": retry_message(errors)}]
        raise AssertionError("unreachable")

    def run_case(self, case):
        """(reply file dict or None, case summary). Raises SpendLimit and LiveError after filling the summary."""
        cid, form = case["id"], case["form"]
        known = foods()
        budget = {"calls": 0}
        reply = {"ideas": None, "picked_idea_id": None, "recipe": None, "reruns": []}
        summary = {"case": cid, "status": "ok", "error": None, "attempts": [], "kept_attempt": None}
        try:
            dishes = pick_dishes(form["craving"], form.get("exclude") or [], seed=cid)
            prompt = idea_prompt(form, inspiration=dishes, known_ingredients=known)
            try:
                ideas, reply["ideas"] = self.ask_json(cid, "ideas", 1, "ideas", prompt, ideas_errors, budget)
            except CallFailed as e:
                reply["ideas"] = e.text
                raise
            idea = ideas["ideas"][0]
            reply["picked_idea_id"] = idea["idea_id"]
            first = rerun = None
            for attempt in range(1, MAX_ATTEMPTS + 1):
                stage = "recipe" if attempt == 1 else "rerun"
                prompt = recipe_prompt(form, idea, known_ingredients=known,
                                       pack_hints=pack_hints_for(pack_hint_foods(idea, rerun), self.packs), rerun=rerun)
                try:
                    recipe, text = self.ask_json(cid, stage, attempt, "recipe", prompt,
                                                 lambda r: recipe_errors(r, idea, form), budget)
                except CallFailed as e:
                    if attempt == 1:
                        reply["recipe"] = e.text
                        raise
                    summary["attempts"].append({"attempt": attempt, "problems": None, "misses": [], "error": str(e)})
                    break
                if attempt == 1:
                    reply["recipe"] = text
                else:
                    reply["reruns"].append(text)
                first = first or recipe
                try:
                    meal = evaluate(form, idea, recipe, country=self.country, table=self.table, packs=self.packs)
                except Exception as e:  # engine error: like the browser, the first one ends the case
                    summary["attempts"].append({"attempt": attempt, "problems": None, "misses": [],
                                                "error": f"engine: {e}"})
                    if attempt == 1:
                        raise CallFailed(f"engine: {e}")
                    break
                problems = problem_count(meal)
                summary["attempts"].append({"attempt": attempt, "problems": problems,
                                            "misses": list(meal["evaluation"]["macros"].get("misses") or [])})
                if problems == 0 or attempt == MAX_ATTEMPTS:
                    break
                rerun = rerun_info(meal, first, attempt + 1)
        except CallFailed as e:
            summary.update(status="error", error=str(e))
        except (SpendLimit, LiveError) as e:
            summary.update(status="stopped", error=str(e))
            raise
        finally:
            best = best_attempt(summary["attempts"])
            summary["kept_attempt"] = best["attempt"] if best else None
            summary["calls"] = budget["calls"]
            summary["cost_usd"] = round(sum(c["cost_usd"] for c in self.calls if c["case"] == cid), 6)
            summary["has_recipe"] = reply["recipe"] is not None and any(a.get("problems") is not None
                                                                         for a in summary["attempts"])
            self._last = (reply, summary)
        return reply, summary


# ---------------------------------------------------------------- outputs

def reply_file(reply, summary):
    out = {k: v for k, v in reply.items() if not (k == "reruns" and not v)}
    out["kept_attempt"] = summary["kept_attempt"]
    out["attempts"] = summary["attempts"]
    return out


def usage_summary(run, provider, model, max_usd, calls, cases, stopped=None):
    meals = [c["cost_usd"] for c in cases if c.get("has_recipe")]
    ok_calls = [c for c in calls if c["status"] == 200]
    totals = {k: sum(c[k] for c in calls) for k in ("input_tokens", "output_tokens", "cache_write_tokens",
                                                    "cache_read_tokens")}
    reruns = [c for c in cases for a in c["attempts"] if a["attempt"] > 1]
    return {"run": run, "provider": provider, "model": model, "max_usd": max_usd,
            "finished": datetime.now(timezone.utc).isoformat(timespec="seconds"), "stopped": stopped,
            "prices": {model: PRICES[model]}, "calls": len(calls), "failed_calls": len(calls) - len(ok_calls),
            "contract_retries": sum(1 for c in calls if c["try"] == 2), **totals,
            "total_cost_usd": round(sum(c["cost_usd"] for c in calls), 6),
            "meals": len(meals),
            "cost_per_meal_mean_usd": round(sum(meals) / len(meals), 6) if meals else None,
            "cost_per_meal_max_usd": round(max(meals), 6) if meals else None,
            "latency_mean_s": round(sum(c["latency_s"] for c in ok_calls) / len(ok_calls), 3) if ok_calls else None,
            "reruns": len(reruns), "cases_with_reruns": len({c["case"] for c in reruns}),
            "kept_not_last": [c["case"] for c in cases if c["attempts"] and c["kept_attempt"] is not None
                              and c["kept_attempt"] != c["attempts"][-1]["attempt"]],
            "cases": cases, "call_log": calls}


def _usd(value):
    return "-" if value is None else f"${value:.4f}"


def usage_md(s):
    latency = "-" if s["latency_mean_s"] is None else f"{s['latency_mean_s']:.1f} s"
    lines = [f"# Live run usage: {s['run']}", "",
             f"Provider {s['provider']}, model `{s['model']}`, spend limit ${s['max_usd']:.2f}. Finished {s['finished']}.",
             f"Prices (USD per MTok): {json.dumps({k: v for k, v in s['prices'][s['model']].items() if k != 'valid_until'})}.",
             ""]
    if s["stopped"]:
        lines += [f"Run stopped early: {s['stopped']}", ""]
    lines += ["| Measure | Value |", "|---|---|",
              f"| Calls | {s['calls']} ({s['failed_calls']} failed, {s['contract_retries']} contract retries) |",
              f"| Input tokens (uncached) | {s['input_tokens']} |", f"| Output tokens | {s['output_tokens']} |",
              f"| Cache write / read tokens | {s['cache_write_tokens']} / {s['cache_read_tokens']} |",
              f"| Total cost | {_usd(s['total_cost_usd'])} |",
              f"| Meals (cases with an evaluated recipe) | {s['meals']} |",
              f"| Cost per meal, mean / max | {_usd(s['cost_per_meal_mean_usd'])} / {_usd(s['cost_per_meal_max_usd'])} |",
              f"| Mean latency per call | {latency} |",
              f"| Reruns | {s['reruns']} in {s['cases_with_reruns']} cases |", ""]
    if s["kept_not_last"]:
        lines += [f"Kept attempt is not the last one (eval.run scores the last): {', '.join(s['kept_not_last'])}.", ""]
    lines += ["## Cases", "", "| Case | Status | Calls | Attempts (problems) | Kept | Cost |", "|---|---|---|---|---|---|"]
    for c in s["cases"]:
        att = ", ".join(f"{a['attempt']} ({'err' if a['problems'] is None else a['problems']})" for a in c["attempts"])
        lines.append(f"| {c['case']} | {c['status']} | {c['calls']} | {att or '-'} | {c['kept_attempt'] or '-'} | "
                     f"{_usd(c['cost_usd'])} |")
    errors = [c for c in s["cases"] if c["error"]]
    if errors:
        lines += ["", "## Errors", ""] + [f"- {c['case']}: {c['error']}" for c in errors]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- dry run

def _reference(cid, replies=REPLIES):
    """(idea, first recipe, number of reruns, run name) from the first stored run with a valid ideas and recipe
    reply for this case, else (None, None, 0, None)."""
    for run in REFERENCE_RUNS:
        path = Path(replies) / run / f"{cid}.json"
        if not path.exists():
            continue
        stored = json.loads(path.read_text(encoding="utf-8"))
        ideas = stored.get("ideas")
        ideas, errors = parse_reply(ideas) if isinstance(ideas, str) else (ideas, [])
        recipe = stored.get("recipe")
        recipe, rerrors = parse_reply(recipe) if isinstance(recipe, str) else (recipe, [])
        if errors or rerrors or validate_output(ideas, "idea.schema.json") or validate_output(recipe, "recipe.schema.json"):
            continue
        wanted = stored.get("picked_idea_id") or ideas["ideas"][0]["idea_id"]
        idea = next((i for i in ideas["ideas"] if i["idea_id"] == wanted), ideas["ideas"][0])
        return idea, recipe, len(stored.get("reruns") or []), run
    return None, None, 0, None


def _stand_in_idea(dish):
    return {"idea_id": "1", "name": dish["name"][:60], "one_line": dish["method"], "main_ingredients": list(dish["core"]),
            "rough_macros": {"kcal": 450, "protein_g": 45, "carbs_g": 40, "fat_g": 12}, "image_prompt": dish["name"]}


def _tokens(prompt):
    return math.ceil(len(prompt["system"] + prompt["user"]) / CHARS_PER_TOKEN)


def dry_run(provider, cases, max_usd, replies=REPLIES, root=ROOT, packs=None, model=None):
    """Build every prompt, estimate calls and cost. No network, no key. Returns the report text."""
    model = model or PROVIDERS[provider]["model"]
    p = PRICES[model]
    packs = load_packs() if packs is None else packs
    known = foods()
    rows, worst_total, expected_total, expected_calls, prompts = [], 0.0, 0.0, 0, 0
    for case in cases:
        cid, form = case["id"], case["form"]
        dishes = pick_dishes(form["craving"], form.get("exclude") or [], seed=cid)
        ip = idea_prompt(form, inspiration=dishes, known_ingredients=known)
        idea, recipe, ref_reruns, ref_run = _reference(cid, replies)
        if idea is None:
            idea = _stand_in_idea(dishes[0])
        rp = recipe_prompt(form, idea, known_ingredients=known, pack_hints=pack_hints_for(pack_hint_foods(idea), packs))
        stage_prompts = [("ideas", ip), ("recipe", rp)]
        if recipe is not None:
            meal = evaluate(form, idea, recipe, country=COUNTRY, packs=packs)
            for attempt in (2, 3):
                rerun = rerun_info(meal, recipe, attempt)
                stage_prompts.append(("recipe", recipe_prompt(form, idea, known_ingredients=known, rerun=rerun,
                                      pack_hints=pack_hints_for(pack_hint_foods(idea, rerun), packs))))
        else:  # no stored recipe: a rerun prompt is the recipe prompt plus the previous recipe and the macro lines
            stage_prompts += [("recipe", {"system": rp["system"], "user": rp["user"] + "x" * 4000})] * 2
        prompts += len(stage_prompts)
        worst = sum(worst_case_usd(provider, model, pr["system"], [{"role": "user", "content": pr["user"]}])
                    for _, pr in stage_prompts[:MAX_CALLS_PER_CASE])
        visible = {"ideas": 700, "recipe": 450} if recipe is None else {
            "ideas": math.ceil(len(json.dumps({"ideas": [idea] * 4}, ensure_ascii=False)) / CHARS_PER_TOKEN),
            "recipe": math.ceil(len(json.dumps(recipe, ensure_ascii=False)) / CHARS_PER_TOKEN)}
        n_calls = 2 + min(ref_reruns, MAX_ATTEMPTS - 1)
        expected = sum((_tokens(pr) * p["input"] + (visible[step] + THINKING_ALLOWANCE[step]) * p["output"]) / 1e6
                       for step, pr in stage_prompts[:n_calls])
        worst_total += worst
        expected_total += expected
        expected_calls += n_calls
        rows.append(f"| {cid} | {_tokens(ip)} | {_tokens(rp)} | {n_calls} | ${expected:.4f} | ${worst:.4f} | "
                    f"{ref_run or 'stand-in idea'} |")
    worst_call = worst_case_usd(provider, model, "", [])
    env = env_problem(root)
    lines = [f"DRY RUN, no network calls. Provider {provider}, model {model}, {len(cases)} cases, {prompts} prompts built.",
             f"Prices (USD per MTok): input {p['input']}, output {p['output']}, cache read {p['cache_read']}. "
             f"Source: {p['source']}.",
             f"Output cap per call: {PROVIDERS[provider]['max_output_tokens']} tokens. Per case: 2 to "
             f"{MAX_CALLS_PER_CASE} calls.", "",
             "| Case | Ideas prompt tok | Recipe prompt tok | Expected calls | Expected cost | Worst case (4 calls at cap) | Prompt source |",
             "|---|---|---|---|---|---|---|", *rows, "",
             f"Expected: {expected_calls} calls, about ${expected_total:.2f}. Assumes {CHARS_PER_TOKEN} characters per "
             f"token, the visible reply sizes of the stored run, reruns as in that run, no contract retries, and "
             f"{THINKING_ALLOWANCE['ideas']} / {THINKING_ALLOWANCE['recipe']} hidden thinking tokens per ideas / recipe "
             f"call (assumption, not measured).",
             f"Worst case with no limit: {len(cases) * MAX_CALLS_PER_CASE} calls, ${worst_total:.2f}. With --max-usd "
             f"{max_usd:.2f} the run stops before any call whose worst case (at least ${worst_call:.4f}) would pass "
             f"${max_usd:.2f}, so it never spends more than ${max_usd:.2f}.",
             f".env check for a live run: {'ok' if env is None else 'would refuse: ' + env} "
             f"(needs {PROVIDERS[provider]['env_key']}; not read in a dry run)."]
    return "\n".join(lines)


# ---------------------------------------------------------------- main

def select_cases(all_cases, wanted):
    if not wanted:
        return all_cases
    out = []
    for w in [x.strip() for x in wanted.split(",") if x.strip()]:
        hit = [c for c in all_cases if c["id"] == w or c["id"].split("-")[0] == w]
        if not hit:
            raise LiveError(f"no golden case {w!r}")
        out += [c for c in hit if c not in out]
    return out


def check_prices_valid(model, today=None):
    until = PRICES[model].get("valid_until")
    if until and (today or date.today()).isoformat() > until:
        raise LiveError(f"refusing to start: the {model} prices in PRICES were valid until {until}; update them first")


def run_live(provider, run, cases, max_usd, key, *, transport=urllib_transport, replies=REPLIES, results=RESULTS,
             log=print, clock=time.monotonic, packs=None, table=None, model=None, min_gap_s=0.0):
    """The paid run. Writes the reply files as each case ends, then the usage files. Returns the usage summary."""
    folder = Path(replies) / run
    if folder.exists() and any(folder.iterdir()):
        raise LiveError(f"refusing to start: {folder} already has replies; pick a new --run name")
    folder.mkdir(parents=True, exist_ok=True)
    runner = Runner(provider, key, max_usd, transport=transport, model=model, log=log, clock=clock, packs=packs,
                    table=table, min_gap_s=min_gap_s)
    summaries, stopped = [], None
    for case in cases:
        log(f"{case['id']}:")
        try:
            reply, summary = runner.run_case(case)
        except LiveError as e:
            reply, summary = runner._last
            stopped = str(e)
        summaries.append(summary)
        if reply["ideas"] is not None:
            (folder / f"{case['id']}.json").write_text(
                json.dumps(reply_file(reply, summary), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        if stopped:
            log(f"STOP: {stopped}")
            break
    summary = usage_summary(run, provider, runner.model, max_usd, runner.calls, summaries, stopped)
    Path(results).mkdir(parents=True, exist_ok=True)
    (Path(results) / f"{run}-usage.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n",
                                                     encoding="utf-8")
    (Path(results) / f"{run}-usage.md").write_text(usage_md(summary), encoding="utf-8")
    return summary


def main(argv=None, *, transport=urllib_transport, root=ROOT, replies=REPLIES, results=RESULTS):
    parser = argparse.ArgumentParser(prog="eval.live", description="Paid live eval run (see the module doc).")
    parser.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    parser.add_argument("--run", required=True, help="name for eval/replies/<run>/ and eval/results/<run>-usage.*")
    parser.add_argument("--model", help="a model of that provider with prices in PRICES (default: the web app's)")
    parser.add_argument("--cases", help="comma-separated case ids or prefixes, e.g. c01,c02 (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="build prompts and estimate cost, no network")
    parser.add_argument("--max-usd", type=float, default=2.00, help="hard spend limit for the run (default 2.00)")
    parser.add_argument("--min-gap", type=float, default=0.0,
                        help="seconds between call starts, for a per-minute rate limit (default 0)")
    args = parser.parse_args(argv)
    try:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.run):
            raise LiveError("--run may use letters, digits, '.', '_' and '-' only")
        if args.max_usd <= 0:
            raise LiveError("--max-usd must be above 0")
        if args.min_gap < 0:
            raise LiveError("--min-gap must be 0 or more")
        model = args.model or PROVIDERS[args.provider]["model"]
        if model not in PROVIDERS[args.provider]["models"] or model not in PRICES:
            raise LiveError(f"--model {model!r} is not a priced {args.provider} model "
                            f"({', '.join(PROVIDERS[args.provider]['models'])})")
        cases = select_cases(load_cases(), args.cases)
        if args.dry_run:
            print(dry_run(args.provider, cases, args.max_usd, replies=replies, root=root, model=model))
            return 0
        check_prices_valid(model)
        key = load_key(root, PROVIDERS[args.provider]["env_key"])
        summary = run_live(args.provider, args.run, cases, args.max_usd, key, transport=transport, replies=replies,
                           results=results, model=model, min_gap_s=args.min_gap)
    except LiveError as e:
        print(f"eval.live: {e}", file=sys.stderr)
        return 2
    print(f"{summary['calls']} calls, ${summary['total_cost_usd']:.4f}. Wrote {Path(results) / (args.run + '-usage.md')}"
          f" and {Path(replies) / args.run}/. Score: .venv/bin/python -m eval.run score {args.run}")
    return 3 if summary["stopped"] else 0


if __name__ == "__main__":
    sys.exit(main())
