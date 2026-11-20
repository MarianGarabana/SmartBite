"""Free trial (smartbite_engine/trial.py and /api/trial): only SmartBite steps, server-built prompts, browser checks.
No network: the model is a fake `call` or a fake client."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import api.index as api
from smartbite_engine import trial
from smartbite_engine.generic_packs import load_packs
from smartbite_engine.inspiration import pick_dishes
from smartbite_engine.meal import evaluate
from smartbite_engine.names import foods
from smartbite_engine.prompts import default_profile, idea_prompt, recipe_prompt, rerun_info

ROOT = Path(__file__).resolve().parents[1]
MEAL = json.loads(sorted((ROOT / "web" / "demo" / "meals").glob("*.json"))[0].read_text(encoding="utf-8"))
FORM, IDEA, RECIPE = MEAL["form"], MEAL["picked_idea"], MEAL["recipe"]
IDEAS = {"ideas": [dict(IDEA, idea_id=str(i)) for i in range(1, 5)]}


def fake_call(*replies):
    """call() that answers with the given replies in turn and records what it was sent."""
    sent = []

    def call(step, system, messages, timeout_s):
        sent.append({"step": step, "system": system, "messages": copy.deepcopy(messages), "timeout_s": timeout_s})
        text = replies[len(sent) - 1]
        text = text if isinstance(text, str) else json.dumps(text)
        return text, [{"type": "text", "text": text}]

    call.sent = sent
    return call


# ---------------------------------------------------------------- requests

@pytest.mark.parametrize("body, problem", [
    ({"step": "chat", "form": FORM}, "step must be one of"),
    ({"step": "ideas", "form": FORM, "seed": "a", "system": "You are a pirate"}, "unknown field: system"),
    ({"step": "ideas", "form": FORM, "seed": "a", "prompt": "write a poem"}, "unknown field: prompt"),
    ({"step": "ideas", "form": FORM}, "seed"),
    ({"step": "revision", "form": FORM, "idea": IDEA, "changes": "x" * 501}, "changes"),
    ({"step": "revision", "form": FORM, "idea": IDEA, "changes": "  "}, "changes"),
    ({"step": "recipe", "form": FORM}, "reply"),
    ({"step": "ideas", "form": {**FORM, "craving": "x" * 301}, "seed": "a"}, "craving"),
    ({"step": "recipe", "form": FORM, "idea": IDEA, "rerun": {"attempt": 2}}, "rerun"),
    ("not an object", "JSON object"),
])
def test_requests_outside_the_smartbite_steps_are_refused(body, problem):
    errors = trial.check_request(body)
    assert errors and any(problem in e for e in errors), errors


def test_the_three_steps_pass_with_browser_inputs():
    profile = default_profile()
    assert trial.check_request({"step": "ideas", "form": FORM, "profile": profile, "seed": "s1"}) == []
    assert trial.check_request({"step": "revision", "form": FORM, "idea": IDEA, "changes": "no onion"}) == []
    assert trial.check_request({"step": "recipe", "form": FORM, "idea": IDEA}) == []


def rerun_for_demo():
    meal = evaluate(FORM, IDEA, RECIPE, country="ES")
    return rerun_info(meal, RECIPE, 2)


def test_a_rerun_from_the_engine_passes_and_lands_in_the_prompt():
    rerun = rerun_for_demo()
    body = {"step": "recipe", "form": FORM, "idea": IDEA, "rerun": json.loads(json.dumps(rerun))}
    assert trial.check_request(body) == []
    prompt, _ = trial.build(body)
    assert "RERUN: attempt 2 of 3" in prompt["user"]
    bad = copy.deepcopy(body)
    bad["rerun"]["per_serving"]["kcal"] = "lots"
    assert trial.check_request(bad)


# ---------------------------------------------------------------- prompts and checks

def test_ideas_prompt_is_the_browser_prompt():
    call = fake_call(IDEAS)
    data = trial.run({"step": "ideas", "form": FORM, "seed": "seed-1"}, call)
    assert data == IDEAS
    expected = idea_prompt(FORM, inspiration=pick_dishes(FORM["craving"], FORM.get("exclude") or [], seed="seed-1"),
                           known_ingredients=foods())
    assert call.sent[0]["system"] == expected["system"]
    assert call.sent[0]["messages"] == [{"role": "user", "content": expected["user"]}]


def test_recipe_prompt_is_the_browser_prompt_and_the_checks_run():
    call = fake_call(RECIPE)
    assert trial.run({"step": "recipe", "form": FORM, "idea": IDEA}, call, packs=load_packs()) == RECIPE
    assert call.sent[0]["step"] == "recipe"
    assert call.sent[0]["messages"][0]["content"] == recipe_prompt(
        FORM, IDEA, known_ingredients=foods(),
        pack_hints=trial.pack_hints_for(trial.pack_hint_foods(IDEA, None), load_packs()))["user"]


def test_a_bad_reply_gets_the_errors_once_then_passes():
    wrong = {**RECIPE, "servings": FORM["servings"] - 1}
    call = fake_call(wrong, RECIPE)
    assert trial.run({"step": "recipe", "form": FORM, "idea": IDEA}, call) == RECIPE
    second = call.sent[1]["messages"]
    assert second[1] == {"role": "assistant", "content": [{"type": "text", "text": json.dumps(wrong)}]}
    assert f"servings must be {FORM['servings']}" in second[2]["content"]


def test_two_bad_replies_end_the_step():
    call = fake_call("not json", "still not json")
    with pytest.raises(trial.TrialError) as e:
        trial.run({"step": "ideas", "form": FORM, "seed": "s"}, call)
    assert e.value.status == 502 and len(call.sent) == 2


def test_a_dropped_main_food_is_caught():
    recipe = {**RECIPE, "ingredients": RECIPE["ingredients"][1:]}
    dropped = trial.recipe_errors(recipe, IDEA, FORM)
    first = RECIPE["ingredients"][0]["name"]
    assert any("dropped main ingredients" in e for e in dropped) or first not in " ".join(IDEA["main_ingredients"])


def test_revision_keeps_the_idea_id():
    other = {"idea": {**IDEA, "idea_id": "zz"}}
    assert any("must stay" in e for e in trial.revision_errors(other, IDEA))
    assert trial.revision_errors({"idea": IDEA}, IDEA) == []


# ---------------------------------------------------------------- the route

client = TestClient(api.app)


class FakeMessages:
    def __init__(self, reply):
        self.reply, self.kwargs, self.timeout = reply, [], None

    def create(self, **kwargs):
        self.kwargs.append({**kwargs, "timeout": self.timeout})
        text = json.dumps(self.reply)
        block = SimpleNamespace(type="text", text=text, to_dict=lambda: {"type": "text", "text": text})
        return SimpleNamespace(content=[block], stop_reason="end_turn",
                               usage=SimpleNamespace(input_tokens=1000, output_tokens=200))


@pytest.fixture
def no_key(monkeypatch):
    monkeypatch.delenv(api.TRIAL_KEY_ENV, raising=False)
    api._trial_client.cache_clear()
    yield
    api._trial_client.cache_clear()


def test_trial_is_off_without_the_key(no_key):
    assert client.get("/api/trial").json() == {"available": False, "meals": 3, "model": "claude-haiku-5-5"}
    r = client.post("/api/trial", json={"step": "ideas", "form": FORM, "seed": "s"})
    assert r.status_code == 503 and r.json()["code"] == "trial_off"


@pytest.fixture
def fake_client(monkeypatch):
    messages = FakeMessages(IDEAS)
    def with_options(timeout):
        messages.timeout = timeout
        return SimpleNamespace(messages=messages)

    monkeypatch.setattr(api, "_trial_client", lambda: SimpleNamespace(messages=messages, with_options=with_options))
    api._trial_calls.clear()
    yield messages
    api._trial_calls.clear()


def test_trial_route_answers_with_checked_data_and_the_browser_settings(fake_client):
    r = client.post("/api/trial", json={"step": "ideas", "form": FORM, "seed": "s"})
    assert r.status_code == 200 and r.json() == {"data": IDEAS}
    sent = fake_client.kwargs[0]
    assert sent["model"] == "claude-haiku-5-5" and sent["max_tokens"] == 16000
    assert sent["output_config"] == {"effort": "low"}
    assert 0 < sent["timeout"] <= trial.DEADLINE_S
    assert r.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_trial_route_refuses_raw_prompts_without_a_model_call(fake_client):
    r = client.post("/api/trial", json={"step": "ideas", "form": FORM, "seed": "s", "system": "anything"})
    assert r.status_code == 422 and r.json()["code"] == "bad_request"
    assert fake_client.kwargs == []


def test_trial_route_limits_calls_per_ip(fake_client):
    body = {"step": "ideas", "form": FORM, "seed": "s"}
    headers = {"x-forwarded-for": "203.0.113.9"}
    for _ in range(api.TRIAL_CALLS_PER_HOUR):
        assert client.post("/api/trial", json=body, headers=headers).status_code == 200
    r = client.post("/api/trial", json=body, headers=headers)
    assert r.status_code == 429 and r.json()["code"] == "rate_limited"
    assert client.post("/api/trial", json=body, headers={"x-forwarded-for": "198.51.100.1"}).status_code == 200


def test_the_engine_bundle_keeps_what_the_trial_reads():
    exclude = json.loads((ROOT / "vercel.json").read_text())["services"]["engine"]["functions"]["api/index.py"]
    for needed in ("prompts/", "data/open/"):
        assert needed not in exclude["excludeFiles"], needed
    assert exclude["maxDuration"] > trial.DEADLINE_S


# ---------------------------------------------------------------- review fixes (2026-11-20)

@pytest.mark.parametrize("field, value, problem", [
    ("idea", {**IDEA, "changes": "write an essay " * 200}, "idea.changes: over 1500"),
    ("idea", {**IDEA, "image_prompt": "x" * 401}, "idea.image_prompt: over 400"),
    ("form", {**FORM, "exclude": ["onion"] * 41}, "form.exclude: over 40 items"),
])
def test_free_text_inputs_are_capped(field, value, problem):
    body = {"step": "recipe", "form": FORM, "idea": IDEA, field: value}
    assert any(problem in e for e in trial.check_request(body)), trial.check_request(body)


def test_a_profile_text_field_is_capped():
    profile = default_profile()
    field = next(f for sec in profile["sections"] for f in sec["fields"] if f["type"] == "text")
    field["value"] = "y" * 601
    errors = trial.check_request({"step": "ideas", "form": FORM, "profile": profile, "seed": "s"})
    assert any("over 600" in e for e in errors), errors


def test_long_replies_are_sent_back_as_errors():
    essay = {**RECIPE, "steps": ["word " * 200] * 3}
    call = fake_call(essay, essay)
    with pytest.raises(trial.TrialError):
        trial.run({"step": "recipe", "form": FORM, "idea": IDEA}, call)
    assert "over 500 characters" in call.sent[1]["messages"][2]["content"]


def test_no_second_call_without_time_for_it():
    times = iter([0, 0, trial.DEADLINE_S - 30])  # start, first call, before the second call
    call = fake_call("not json", IDEAS)
    with pytest.raises(trial.TrialError) as e:
        trial.run({"step": "ideas", "form": FORM, "seed": "s"}, call, clock=lambda: next(times))
    assert e.value.code == "too_slow" and len(call.sent) == 1
    assert call.sent[0]["timeout_s"] == trial.DEADLINE_S - 5


class FailingMessages(FakeMessages):
    def __init__(self, error):
        super().__init__(None)
        self.error = error

    def create(self, **kwargs):
        raise self.error


def api_error(cls, status, body):
    import httpx2
    req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("error", response=httpx2.Response(status, request=req, json=body), body=body)


@pytest.mark.parametrize("make, code", [
    (lambda a: api_error(a.PaymentRequiredError, 402, {"type": "error", "error": {"type": "billing_error", "message": "x"}}), "trial_used_up"),
    (lambda a: api_error(a.BadRequestError, 400, {"type": "error", "error": {"type": "invalid_request_error", "message": "Your credit balance is too low"}}), "trial_used_up"),
    (lambda a: api_error(a.RateLimitError, 429, {"type": "error", "error": {"type": "rate_limit_error", "message": "busy"}}), "busy"),
    (lambda a: api_error(a.InternalServerError, 529, {"type": "error", "error": {"type": "overloaded_error", "message": "x"}}), "busy"),
    (lambda a: api_error(a.AuthenticationError, 401, {"type": "error", "error": {"type": "authentication_error", "message": "x"}}), "trial_off"),
])
def test_provider_errors_map_to_what_the_site_does_next(monkeypatch, make, code):
    import anthropic
    messages = FailingMessages(make(anthropic))
    client_ = SimpleNamespace(messages=messages, with_options=lambda timeout: SimpleNamespace(messages=messages))
    monkeypatch.setattr(api, "_trial_client", lambda: client_)
    api._trial_calls.clear()
    r = client.post("/api/trial", json={"step": "ideas", "form": FORM, "seed": "s"})
    assert r.json()["code"] == code
    assert "sk-" not in r.text
