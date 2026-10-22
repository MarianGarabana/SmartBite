import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from smartbite_engine.contracts import validate_output

DEMO = Path(__file__).resolve().parents[1] / "web" / "demo" / "meals"
client = TestClient(app)


def demo_input():
    meal = json.loads(sorted(DEMO.glob("*.json"))[0].read_text(encoding="utf-8"))
    return {k: meal[k] for k in ("form", "picked_idea", "recipe")}, meal


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_evaluate_returns_a_valid_meal_equal_to_the_demo_meal():
    body, meal = demo_input()
    r = client.post("/api/evaluate", json=body)
    assert r.status_code == 200
    data = r.json()
    assert validate_output(data, "evaluate.schema.json", "Output") == []
    assert data["evaluation"] == meal["evaluation"] and data["mfp"] == meal["mfp"]


def test_profile_is_accepted():
    body, _ = demo_input()
    profile = json.loads((Path(__file__).resolve().parents[1] / "prompts" / "kitchen-profile.default.json").read_text())
    assert client.post("/api/evaluate", json={**body, "profile": profile}).status_code == 200


@pytest.mark.parametrize("change", [
    lambda b: b.pop("recipe"),
    lambda b: b["form"].update(servings=9),
    lambda b: b["recipe"].update(ingredients=[]),
    lambda b: b.update(api_key="sk-test"),
    lambda b: b["recipe"]["ingredients"][0].pop("grams_per_serving"),
])
def test_invalid_input_is_a_422_with_the_error_list(change):
    body, _ = demo_input()
    change(body)
    r = client.post("/api/evaluate", json=body)
    assert r.status_code == 422
    errors = r.json()["errors"]
    assert isinstance(errors, list) and errors and all(isinstance(e, str) for e in errors)


def test_body_that_is_not_json_is_a_422():
    r = client.post("/api/evaluate", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code == 422 and r.json()["errors"][0].startswith("request body is not valid JSON")



def test_an_engine_crash_is_a_json_500_logged_without_the_body(monkeypatch, caplog):
    import api.index as api

    def boom(*args, **kwargs):
        raise KeyError("ground beef secret-value")

    monkeypatch.setattr(api, "evaluate", boom)
    body, _ = demo_input()
    body["products"] = [{"food": "ground beef", "name": "beef 300 g", "sold_by": "pack", "pack_grams": 300,
                         "price_eur": 4.99}]
    r = client.post("/api/evaluate", json=body, headers={"x-api-key": "sk-ant-test-key"})
    assert r.status_code == 500
    error = r.json()["errors"][0]
    assert error.startswith("the meal engine failed (error id ")
    logged = [r.getMessage() for r in caplog.records if r.name == "smartbite.engine"]
    record = json.loads(logged[-1])
    assert record["event"] == "evaluate_failed" and record["error"] == "KeyError"
    assert record["error_id"] in error
    assert record["servings"] == body["form"]["servings"] and record["products"] == 1
    assert any("boom" in w for w in record["where"])
    text = logged[-1]
    for secret in ("secret-value", "sk-ant", "4.99", "beef 300 g", body["recipe"]["title"],
                   body["form"]["craving"][:20]):
        assert secret not in text
