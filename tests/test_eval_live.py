"""eval/live.py with the HTTP layer mocked: no network call in any test."""
import copy
import json
import re
import subprocess
import urllib.request
from datetime import date
from pathlib import Path

import pytest

from eval import live
from eval.run import load_cases, score
from smartbite_engine.prompts import idea_prompt

ROOT = Path(__file__).resolve().parents[1]
STORED = json.loads((ROOT / "eval" / "replies" / "v3" / "c01-greek-chicken.json").read_text(encoding="utf-8"))
CASE = next(c for c in load_cases() if c["id"] == "c01-greek-chicken")
IDEAS = json.dumps(STORED["ideas"])
RECIPE = json.dumps(STORED["recipe"])
KEY = "sk-ant-test-0123456789abcdef"
QUIET = lambda *_: None


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*a, **k):
        raise AssertionError("a test tried to open a network connection")
    monkeypatch.setattr(urllib.request, "urlopen", blocked)


def anthropic_reply(text, usage=None, stop="end_turn"):
    return 200, json.dumps({
        "content": [{"type": "thinking", "thinking": "", "signature": "sig-1"}, {"type": "text", "text": text}],
        "stop_reason": stop,
        "usage": usage or {"input_tokens": 3000, "output_tokens": 1500, "cache_creation_input_tokens": 0,
                           "cache_read_input_tokens": 0}}).encode()


def gemini_reply(text, usage=None, finish="stop"):
    return 200, json.dumps({"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": finish}],
                            "usage": usage or {"prompt_tokens": 3000, "completion_tokens": 1500,
                                               "total_tokens": 4500}}).encode()


class FakeTransport:
    """Returns the queued (status, bytes) replies in order and keeps every request."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def __call__(self, url, headers, body):
        self.requests.append({"url": url, "headers": headers, "body": json.loads(body.decode("utf-8"))})
        if not self.replies:
            raise AssertionError("more calls than queued replies")
        return self.replies.pop(0)


def fake_meal(problems, form=CASE["form"]):
    """An evaluated meal with this many macro misses (enough for rerun_info)."""
    recipe = STORED["recipe"]
    return {"form": form, "recipe": recipe, "evaluation": {
        "macros": {"per_serving": {"kcal": 400, "protein_g": 30, "carbs_g": 40, "fat_g": 10}, "lines": [],
                   "misses": [f"miss {i}" for i in range(problems)], "unresolved": []},
        "change_requests": []}}


def patch_evaluate(monkeypatch, problems):
    seq = list(problems)
    monkeypatch.setattr(live, "evaluate", lambda *a, **k: fake_meal(seq.pop(0)))


def runner(transport, provider="anthropic", max_usd=2.0):
    return live.Runner(provider, KEY, max_usd, transport=transport, log=QUIET, clock=iter(range(0, 1000, 2)).__next__)


# ---------------------------------------------------------------- settings parity with the browser

def test_settings_match_the_web_app():
    llm = (ROOT / "web" / "lib" / "llm.js").read_text(encoding="utf-8")
    providers = (ROOT / "web" / "lib" / "providers.js").read_text(encoding="utf-8")
    assert f'ANTHROPIC_URL = "{live.ANTHROPIC_URL}"' in llm
    assert f'ANTHROPIC_VERSION = "{live.ANTHROPIC_VERSION}"' in llm
    assert re.search(rf"MAX_TOKENS = {live.MAX_TOKENS};", llm)
    effort = re.search(r"const EFFORT = \{(.*?)\};", llm).group(1)
    assert dict(re.findall(r'(\w+): "(\w+)"', effort)) == live.EFFORT
    gemini_effort = re.search(r"const GEMINI_EFFORT = \{(.*?)\};", llm).group(1)
    assert dict(re.findall(r'(\w+): "(\w+)"', gemini_effort)) == live.GEMINI_EFFORT
    assert re.search(r'ANTHROPIC_MODELS = \[\s*\{ id: "claude-sonnet-5-5"', providers)
    assert live.PROVIDERS["anthropic"]["model"] == "claude-sonnet-5-5"
    gemini = re.search(r'\{ id: "gemini".*?\}', providers, re.DOTALL).group(0)
    assert f'baseUrl: "{live.GEMINI_BASE_URL}"' in gemini
    assert f'model: "{live.PROVIDERS["gemini"]["model"]}"' in gemini
    assert "/chat/completions" in llm and 'response_format: { type: "json_object" }' in llm
    assert "Your reply did not pass the checks:" in llm
    assert "Reply again with ONLY the corrected JSON object, no other text." in llm
    for p in live.PROVIDERS.values():
        assert p["model"] in p["models"]
        assert all(m in live.PRICES for m in p["models"])


# ---------------------------------------------------------------- request shape

def test_anthropic_request_shape(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    t = FakeTransport([anthropic_reply(IDEAS), anthropic_reply(RECIPE)])
    reply, summary = runner(t).run_case(CASE)
    assert summary["status"] == "ok" and summary["calls"] == 2
    first, second = t.requests
    assert first["url"] == "https://api.anthropic.com/v1/messages"
    assert first["headers"] == {"content-type": "application/json", "x-api-key": KEY,
                                "anthropic-version": "2023-06-01", "user-agent": "SmartBite"}
    assert set(first["body"]) == {"model", "max_tokens", "system", "messages", "output_config"}
    assert first["body"]["model"] == "claude-sonnet-5-5" and first["body"]["max_tokens"] == 16000
    assert first["body"]["output_config"] == {"effort": "low"}
    assert second["body"]["output_config"] == {"effort": "medium"}
    expected = idea_prompt(CASE["form"], inspiration=live.pick_dishes(CASE["form"]["craving"], [], seed=CASE["id"]),
                           known_ingredients=live.foods())
    assert first["body"]["system"] == expected["system"]
    assert first["body"]["messages"] == [{"role": "user", "content": expected["user"]}]
    assert reply["picked_idea_id"] == STORED["ideas"]["ideas"][0]["idea_id"]


def test_gemini_request_shape(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    t = FakeTransport([gemini_reply(IDEAS), gemini_reply(RECIPE)])
    _, summary = runner(t, "gemini").run_case(CASE)
    assert summary["status"] == "ok"
    req = t.requests[0]
    assert req["url"] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert req["headers"] == {"content-type": "application/json", "authorization": f"Bearer {KEY}",
                              "user-agent": "SmartBite"}
    assert set(req["body"]) == {"model", "messages", "response_format", "reasoning_effort"}
    assert req["body"]["reasoning_effort"] == "low"  # ideas
    assert "reasoning_effort" not in t.requests[1]["body"]  # the recipe keeps Gemini's default
    assert req["body"]["model"] == "gemini-3.6-flash"  # the web app's default since 2026-11-01
    assert req["body"]["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in req["body"]["messages"]] == ["system", "user"]


# ---------------------------------------------------------------- usage and cost

def test_parse_usage_anthropic():
    u = live.parse_usage("anthropic", {"usage": {"input_tokens": 100, "output_tokens": 50,
                                                 "cache_creation_input_tokens": 20, "cache_read_input_tokens": 10}})
    assert u == {"input_tokens": 100, "output_tokens": 50, "cache_write_tokens": 20, "cache_read_tokens": 10,
                 "reasoning_tokens": None}
    assert live.parse_usage("anthropic", None)["output_tokens"] == 0


def test_parse_usage_gemini_counts_hidden_thinking_and_cache():
    # completion_tokens without the thinking: the rest of total_tokens is billed as output
    u = live.parse_usage("gemini", {"usage": {"prompt_tokens": 1000, "completion_tokens": 300, "total_tokens": 2500,
                                              "prompt_tokens_details": {"cached_tokens": 400},
                                              "completion_tokens_details": {"reasoning_tokens": 1200}}})
    assert u == {"input_tokens": 600, "output_tokens": 1500, "cache_write_tokens": 0, "cache_read_tokens": 400,
                 "reasoning_tokens": 1200}
    # OpenAI-style: completion_tokens already includes reasoning
    u = live.parse_usage("gemini", {"usage": {"prompt_tokens": 1000, "completion_tokens": 1500, "total_tokens": 2500}})
    assert u["output_tokens"] == 1500 and u["reasoning_tokens"] is None


def test_cost_math():
    mtok = {"input_tokens": 1_000_000, "output_tokens": 0, "cache_write_tokens": 0, "cache_read_tokens": 0}
    assert live.cost_usd("claude-sonnet-5-5", mtok) == pytest.approx(2.00)
    u = {"input_tokens": 3000, "output_tokens": 1500, "cache_write_tokens": 1000, "cache_read_tokens": 2000}
    assert live.cost_usd("claude-sonnet-5-5", u) == pytest.approx((3000 * 2 + 1500 * 10 + 1000 * 2.5 + 2000 * 0.2) / 1e6)
    g = {"input_tokens": 600, "output_tokens": 1500, "cache_write_tokens": 0, "cache_read_tokens": 400}
    assert live.cost_usd("gemini-3.8-flash", g) == pytest.approx((600 * 0.75 + 1500 * 3.75 + 400 * 0.075) / 1e6)
    for price in live.PRICES.values():
        assert price["source"] and price["input"] > 0 and price["output"] > 0


def test_worst_case_uses_the_output_cap():
    assert live.worst_case_usd("anthropic", "claude-sonnet-5-5", "", []) >= 16000 * 10 / 1e6
    assert live.worst_case_usd("gemini", "gemini-3.8-flash", "", []) >= 65536 * 3.75 / 1e6
    small = live.worst_case_usd("anthropic", "claude-sonnet-5-5", "x" * 100, [])
    assert live.worst_case_usd("anthropic", "claude-sonnet-5-5", "x" * 100, [], prior_output_tokens=5000) > small


def test_usage_recorded_per_call(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    t = FakeTransport([anthropic_reply(IDEAS), anthropic_reply(RECIPE)])
    r = runner(t)
    r.run_case(CASE)
    call = r.calls[0]
    assert {k: call[k] for k in ("case", "stage", "attempt", "try", "model", "status")} == \
        {"case": CASE["id"], "stage": "ideas", "attempt": 1, "try": 1, "model": "claude-sonnet-5-5", "status": 200}
    assert call["input_tokens"] == 3000 and call["output_tokens"] == 1500 and call["latency_s"] == 2
    assert call["cost_usd"] == pytest.approx((3000 * 2 + 1500 * 10) / 1e6)
    assert r.spent == pytest.approx(2 * call["cost_usd"])


# ---------------------------------------------------------------- spend guard and call cap

def test_spend_guard_stops_before_the_first_call(tmp_path):
    t = FakeTransport([])
    s = live.run_live("anthropic", "t", [CASE], 0.10, KEY, transport=t, replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)
    assert t.requests == [] and s["calls"] == 0
    assert "could cost up to" in s["stopped"]
    assert (tmp_path / "res" / "t-usage.md").read_text().count("Run stopped early") == 1


def test_spend_guard_stops_the_run_mid_way(tmp_path, monkeypatch):
    patch_evaluate(monkeypatch, [0, 0])
    big = {"input_tokens": 0, "output_tokens": 30000}  # $0.30, then the next worst case passes $0.40
    t = FakeTransport([anthropic_reply(IDEAS, usage=big)])
    s = live.run_live("anthropic", "t", [CASE, CASE], 0.40, KEY, transport=t, replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)
    assert len(t.requests) == 1 and s["calls"] == 1
    assert s["total_cost_usd"] == pytest.approx(0.30) and s["total_cost_usd"] <= 0.40
    assert s["stopped"] and len(s["cases"]) == 1 and s["cases"][0]["status"] == "stopped"
    # ideas were answered, so the case file is written (with no recipe)
    stored = json.loads((tmp_path / "r" / "t" / f"{CASE['id']}.json").read_text())
    assert stored["recipe"] is None and stored["ideas"] == IDEAS


def test_at_most_four_calls_per_case(monkeypatch):
    patch_evaluate(monkeypatch, [2, 1, 1])
    t = FakeTransport([anthropic_reply("not json"), anthropic_reply(IDEAS), anthropic_reply(RECIPE),
                       anthropic_reply(RECIPE)])
    r = runner(t)
    reply, summary = r.run_case(CASE)
    assert len(t.requests) == 4 and summary["calls"] == 4
    assert [a["attempt"] for a in summary["attempts"]] == [1, 2, 3]
    assert "4 model calls used" in summary["attempts"][-1]["error"]
    assert summary["kept_attempt"] == 2 and len(reply["reruns"]) == 1


# ---------------------------------------------------------------- contract retry

def test_retry_once_on_contract_error(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    bad = json.dumps({"ideas": STORED["ideas"]["ideas"][:2]})  # two ideas: fails minItems
    t = FakeTransport([anthropic_reply(bad), anthropic_reply(IDEAS), anthropic_reply(RECIPE)])
    r = runner(t)
    _, summary = r.run_case(CASE)
    assert summary["status"] == "ok" and summary["calls"] == 3
    retry = t.requests[1]["body"]["messages"]
    assert [m["role"] for m in retry] == ["user", "assistant", "user"]
    assert retry[1]["content"] == json.loads(anthropic_reply(bad)[1])["content"]  # thinking block sent back unchanged
    assert retry[2]["content"].startswith("Your reply did not pass the checks:\n- ")
    assert retry[2]["content"].endswith("Reply again with ONLY the corrected JSON object, no other text.")
    assert r.calls[0]["contract_errors"] and r.calls[1]["try"] == 2


def test_gemini_retry_sends_the_text_back(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    t = FakeTransport([gemini_reply("Here you go: {}"), gemini_reply(IDEAS), gemini_reply(RECIPE)])
    runner(t, "gemini").run_case(CASE)
    msgs = t.requests[1]["body"]["messages"]
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "user"]
    assert msgs[2]["content"] == "Here you go: {}"


def test_invalid_twice_ends_the_case(monkeypatch):
    t = FakeTransport([anthropic_reply("nope"), anthropic_reply("still nope")])
    reply, summary = runner(t).run_case(CASE)
    assert summary["status"] == "error" and "not valid twice" in summary["error"]
    assert reply["ideas"] == "still nope" and reply["recipe"] is None and summary["calls"] == 2


def test_recipe_checks_like_the_browser():
    idea = STORED["ideas"]["ideas"][0]
    recipe = copy.deepcopy(STORED["recipe"])
    assert live.recipe_errors(recipe, idea, CASE["form"]) == []
    recipe["servings"] = 2
    recipe["idea_id"] = "9"
    recipe["ingredients"] = [i for i in recipe["ingredients"] if i["name"] != "chicken breast"]
    errors = " ".join(live.recipe_errors(recipe, idea, CASE["form"]))
    assert "idea_id must be" in errors and "servings must be 4" in errors and "dropped main ingredients" in errors
    dup = copy.deepcopy(STORED["ideas"])
    dup["ideas"][1]["idea_id"] = dup["ideas"][0]["idea_id"]
    assert any("must all be different" in e for e in live.ideas_errors(dup))


# ---------------------------------------------------------------- rerun loop

def test_rerun_loop_until_no_problems(monkeypatch):
    patch_evaluate(monkeypatch, [2, 1, 0])
    t = FakeTransport([anthropic_reply(IDEAS), anthropic_reply(RECIPE), anthropic_reply(RECIPE),
                       anthropic_reply(RECIPE)])
    r = runner(t)
    reply, summary = r.run_case(CASE)
    assert [a["problems"] for a in summary["attempts"]] == [2, 1, 0]
    assert summary["kept_attempt"] == 3 and len(reply["reruns"]) == 2
    assert [c["stage"] for c in r.calls] == ["ideas", "recipe", "rerun", "rerun"]
    assert "RERUN:" not in t.requests[1]["body"]["messages"][0]["content"]
    rerun_user = t.requests[2]["body"]["messages"][0]["content"]
    assert "RERUN: attempt 2 of 3" in rerun_user
    assert "RERUN: attempt 3 of 3" in t.requests[3]["body"]["messages"][0]["content"]


def test_no_rerun_when_the_first_recipe_is_fine(monkeypatch):
    patch_evaluate(monkeypatch, [0])
    t = FakeTransport([anthropic_reply(IDEAS), anthropic_reply(RECIPE)])
    reply, summary = runner(t).run_case(CASE)
    assert len(t.requests) == 2 and reply["reruns"] == [] and summary["kept_attempt"] == 1


def test_keeps_the_best_attempt_not_the_last(monkeypatch, tmp_path):
    patch_evaluate(monkeypatch, [1, 3, 2])
    t = FakeTransport([anthropic_reply(IDEAS)] + [anthropic_reply(RECIPE)] * 3)
    s = live.run_live("anthropic", "t", [CASE], 2.0, KEY, transport=t, replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)
    assert s["cases"][0]["kept_attempt"] == 1 and s["kept_not_last"] == [CASE["id"]]
    assert s["reruns"] == 2 and s["cases_with_reruns"] == 1


def test_failed_rerun_ends_the_loop_and_keeps_the_best(monkeypatch):
    patch_evaluate(monkeypatch, [2])
    err = (500, json.dumps({"error": {"message": f"overloaded for {KEY}"}}).encode())
    t = FakeTransport([anthropic_reply(IDEAS), anthropic_reply(RECIPE), err])
    r = runner(t)
    _, summary = r.run_case(CASE)
    assert summary["status"] == "ok" and summary["kept_attempt"] == 1
    assert summary["attempts"][-1]["problems"] is None and "HTTP 500" in summary["attempts"][-1]["error"]
    assert KEY not in json.dumps(r.calls) and "[key]" in r.calls[-1]["error"]


def test_gemini_error_in_a_list_keeps_its_message():
    err = (429, json.dumps([{"error": {"code": 429, "message": f"Quota exceeded for {KEY}"}}]).encode())
    r = runner(FakeTransport([err]), "gemini")
    _, summary = r.run_case(CASE)
    assert summary["status"] == "error" and "HTTP 429: Quota exceeded" in summary["error"]
    assert KEY not in json.dumps(r.calls)


def test_refusal_and_cut_off_fail_the_stage(monkeypatch):
    t = FakeTransport([anthropic_reply("", stop="refusal")])
    _, summary = runner(t).run_case(CASE)
    assert summary["status"] == "error" and "declined" in summary["error"]
    t = FakeTransport([gemini_reply("{", finish="length")])
    _, summary = runner(t, "gemini").run_case(CASE)
    assert "cut off" in summary["error"]


def test_auth_error_stops_the_run(tmp_path):
    t = FakeTransport([(401, b'{"error": {"message": "invalid x-api-key"}}')])
    s = live.run_live("anthropic", "t", [CASE, CASE], 2.0, KEY, transport=t, replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)
    assert "401" in s["stopped"] and len(t.requests) == 1


# ---------------------------------------------------------------- outputs

def test_end_to_end_files_score_and_no_key(tmp_path):
    # Real engine evaluation; the fake model answers every recipe call with the stored v3 recipe
    t = FakeTransport([anthropic_reply(IDEAS)] + [anthropic_reply(RECIPE)] * 3)
    s = live.run_live("anthropic", "e2e", [CASE], 2.0, KEY, transport=t, replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)
    stored = json.loads((tmp_path / "r" / "e2e" / f"{CASE['id']}.json").read_text())
    assert stored["ideas"] == IDEAS and stored["recipe"] == RECIPE and stored["kept_attempt"] >= 1
    summary = score("e2e", replies=tmp_path / "r", results=tmp_path / "res")
    assert summary["cases"] == 15 and CASE["id"] not in summary["missing"]
    usage = json.loads((tmp_path / "res" / "e2e-usage.json").read_text())
    md = (tmp_path / "res" / "e2e-usage.md").read_text()
    assert usage["calls"] == s["calls"] == len(t.requests) and usage["meals"] == 1
    assert usage["cost_per_meal_mean_usd"] == usage["cost_per_meal_max_usd"] == usage["total_cost_usd"]
    assert "Cost per meal, mean / max" in md and "Mean latency per call" in md
    for text in (json.dumps(usage), md, json.dumps(stored)):
        assert KEY not in text


def test_refuses_to_overwrite_a_run(tmp_path):
    (tmp_path / "r" / "old").mkdir(parents=True)
    (tmp_path / "r" / "old" / "c01.json").write_text("{}")
    with pytest.raises(live.LiveError, match="already has replies"):
        live.run_live("anthropic", "old", [CASE], 2.0, KEY, transport=FakeTransport([]), replies=tmp_path / "r",
                      results=tmp_path / "res", log=QUIET)


def test_prices_valid_until():
    live.check_prices_valid("gemini-3.8-flash", today=date(2026, 12, 31))
    with pytest.raises(live.LiveError, match="valid until"):
        live.check_prices_valid("gemini-3.8-flash", today=date(2027, 1, 1))
    live.check_prices_valid("claude-sonnet-5-5", today=date(2030, 1, 1))


def test_select_cases():
    cases = load_cases()
    assert [c["id"] for c in live.select_cases(cases, "c01,c03-tuna-no-cook")] == ["c01-greek-chicken",
                                                                                   "c03-tuna-no-cook"]
    assert live.select_cases(cases, None) == cases
    with pytest.raises(live.LiveError):
        live.select_cases(cases, "c99")


# ---------------------------------------------------------------- .env handling

def git_repo(path, ignore=".env\n"):
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    (path / ".gitignore").write_text(ignore)
    return path


def test_env_missing(tmp_path):
    git_repo(tmp_path)
    with pytest.raises(live.LiveError, match="no .env file"):
        live.load_key(tmp_path, "ANTHROPIC_API_KEY")


def test_env_not_ignored(tmp_path):
    git_repo(tmp_path, ignore="")
    (tmp_path / ".env").write_text(f"ANTHROPIC_API_KEY={KEY}\n")
    with pytest.raises(live.LiveError, match="not ignored") as e:
        live.load_key(tmp_path, "ANTHROPIC_API_KEY")
    assert KEY not in str(e.value)


def test_env_tracked(tmp_path):
    git_repo(tmp_path)
    (tmp_path / ".env").write_text(f"ANTHROPIC_API_KEY={KEY}\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "-f", ".env"], check=True)
    with pytest.raises(live.LiveError, match="tracked by git"):
        live.load_key(tmp_path, "ANTHROPIC_API_KEY")


def test_env_not_a_repo(tmp_path):
    (tmp_path / ".env").write_text(f"ANTHROPIC_API_KEY={KEY}\n")
    with pytest.raises(live.LiveError, match="could not check"):
        live.load_key(tmp_path, "ANTHROPIC_API_KEY")


def test_env_missing_key_and_good_key(tmp_path, capsys):
    git_repo(tmp_path)
    (tmp_path / ".env").write_text("# keys\nexport GEMINI_API_KEY='AIza-gem-key-123'\nOTHER=1\n")
    with pytest.raises(live.LiveError, match="has no ANTHROPIC_API_KEY"):
        live.load_key(tmp_path, "ANTHROPIC_API_KEY")
    assert live.load_key(tmp_path, "GEMINI_API_KEY") == "AIza-gem-key-123"
    (tmp_path / ".env").write_text(f'ANTHROPIC_API_KEY="{KEY}"\n')
    assert live.load_key(tmp_path, "ANTHROPIC_API_KEY") == KEY
    out = capsys.readouterr()
    assert KEY not in out.out + out.err and "AIza" not in out.out + out.err


def test_main_refuses_without_env(tmp_path, capsys):
    git_repo(tmp_path)
    code = live.main(["--provider", "anthropic", "--run", "x"], transport=FakeTransport([]), root=tmp_path,
                     replies=tmp_path / "r", results=tmp_path / "res")
    assert code == 2 and "refusing to start" in capsys.readouterr().err
    assert not (tmp_path / "r").exists()


def test_main_refuses_an_unpriced_or_wrong_provider_model(tmp_path, capsys):
    for model in ("gemini-9-ultra", "claude-sonnet-5-5"):
        code = live.main(["--provider", "gemini", "--model", model, "--run", "x", "--dry-run"],
                         transport=FakeTransport([]), root=tmp_path, results=tmp_path / "res")
        assert code == 2 and "is not a priced gemini model" in capsys.readouterr().err


def test_model_option_reaches_requests_and_usage(tmp_path, monkeypatch):
    patch_evaluate(monkeypatch, [])
    git_repo(tmp_path)
    (tmp_path / ".env").write_text(f"GEMINI_API_KEY={KEY}\n")
    (tmp_path / ".gitignore").write_text(".env\n")
    t = FakeTransport([gemini_reply(IDEAS), gemini_reply(RECIPE)])
    code = live.main(["--provider", "gemini", "--model", "gemini-3.5-flash-lite", "--run", "lite", "--cases", "c01"],
                     transport=t, root=tmp_path, replies=tmp_path / "r", results=tmp_path / "res")
    assert code == 0 and [r["body"]["model"] for r in t.requests] == ["gemini-3.5-flash-lite"] * 2
    usage = json.loads((tmp_path / "res" / "lite-usage.json").read_text())
    assert usage["model"] == "gemini-3.5-flash-lite" and {c["model"] for c in usage["call_log"]} == {"gemini-3.5-flash-lite"}


def test_min_gap_waits_between_call_starts(monkeypatch):
    patch_evaluate(monkeypatch, [])
    ticks, sleeps = iter(range(1000)), []
    r = live.Runner("gemini", KEY, 2.0, transport=FakeTransport([gemini_reply(IDEAS), gemini_reply(RECIPE)]),
                    log=QUIET, clock=ticks.__next__, min_gap_s=4.5, sleep=sleeps.append)
    r.run_case(CASE)
    # call 1 starts at 0 and ends at 1; the gap check reads 2, so it waits 2.5 s and call 2 starts at 3
    assert sleeps == [2.5] and len(r.calls) == 2


def test_main_refuses_a_negative_min_gap(tmp_path, capsys):
    code = live.main(["--provider", "gemini", "--run", "x", "--dry-run", "--min-gap", "-1"],
                     transport=FakeTransport([]), root=tmp_path, results=tmp_path / "res")
    assert code == 2 and "--min-gap must be 0 or more" in capsys.readouterr().err


def test_flash_lite_cost_math():
    usage = {"input_tokens": 1_000_000, "output_tokens": 1_000_000, "cache_read_tokens": 1_000_000,
             "cache_write_tokens": 0}
    assert live.cost_usd("gemini-3.5-flash-lite", usage) == pytest.approx(0.30 + 2.50 + 0.03)


def test_flash_36_cost_math_and_end_date():
    usage = {"input_tokens": 1_000_000, "output_tokens": 1_000_000, "cache_read_tokens": 1_000_000,
             "cache_write_tokens": 0}
    assert live.cost_usd("gemini-3.6-flash", usage) == pytest.approx(0.75 + 3.75 + 0.075)
    assert live.PRICES["gemini-3.6-flash"]["valid_until"] == "2026-12-31"
    assert "gemini-3.6-flash" in live.PROVIDERS["gemini"]["models"]


# ---------------------------------------------------------------- dry run

@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
def test_dry_run_needs_no_key_and_no_network(tmp_path, capsys, provider):
    t = FakeTransport([])
    code = live.main(["--provider", provider, "--run", "dry", "--dry-run", "--cases", "c01,c02"], transport=t,
                     root=tmp_path, results=tmp_path / "res")
    out = capsys.readouterr().out
    assert code == 0 and t.requests == []
    assert "DRY RUN, no network calls" in out and "2 cases, 8 prompts built" in out
    assert re.search(r"Expected: \d+ calls, about \$\d+\.\d\d", out)
    assert "would refuse: no .env file" in out
    assert not (tmp_path / "res").exists()
