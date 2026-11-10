"""Recipe import eval: the code grader and the runner, with no network (fake transport)."""
import copy
import json

import pytest

from eval import live
from eval.recipe_import import run as imp
from eval.recipe_import.grade import grade_case, line_score
from smartbite_engine.contracts import validate_output
from smartbite_engine.names import foods
from smartbite_engine.prompts import import_prompt

CASES = imp.load_cases()
KNOWN = set(foods())


def perfect(case):
    """A reply that does what the key says: every food under its first accepted name, grams at the expected value."""
    ings = []
    for n, food in enumerate(case["foods"]):
        if food["optional"]:
            continue
        name = food["accept"][0]
        if name == "UNKNOWN":
            name = food["unknown_names"][0]
        elif name == "ANY":
            name = f"unlisted spice {n}"
        check = food["check"] or {}
        eggs = check.get("kind") == "eggs"
        units = check["expected"] if eggs else 0
        grams = units * 51 if eggs else (check.get("expected") or 5)
        ings.append({"line": food["line"].removeprefix("(steps) "), "name": name, "grams_total": grams,
                     "units_total": units, "guessed": not check, "storage": "fresh", "pantry": food["pantry"],
                     "dry": False})
    return {"title": case["id"], "servings": case["servings"], "prep_time_min": 30, "ingredients": ings,
            "steps": ["Cook."]}


def by_id(cid):
    return next(c for c in CASES if c["id"] == cid)


def test_golden_set_shape():
    assert len(CASES) == 10
    assert sum(c["lang"] == "es" for c in CASES) == 3
    assert all(validate_output(perfect(c), "import.schema.json") == [] for c in CASES)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_perfect_reply_passes(case):
    g = grade_case(case, perfect(case), KNOWN)
    assert g["passed"], g["fails"]


def test_servings_are_strict():
    case = by_id("en-shakshouka")
    reply = perfect(case)
    reply["servings"] = 6  # 6 eggs is not a stated servings count
    g = grade_case(case, reply, KNOWN)
    assert not g["passed"] and any("servings 6" in f for f in g["fails"])


def test_grams_outside_window_fail_and_spices_only_note():
    case = by_id("en-shakshouka")
    reply = perfect(case)
    oil = next(i for i in reply["ingredients"] if i["name"] == "extra virgin olive oil")
    oil["grams_total"] = 30  # 6 tbsp is about 81 g
    reply["ingredients"] = [i for i in reply["ingredients"] if i["name"] != "paprika"]
    g = grade_case(case, reply, KNOWN)
    assert not g["passed"]
    assert any(f.startswith("6 tbsp olive oil: amount 30 outside") for f in g["fails"])
    assert any(n.startswith("1 tbsp sweet paprika: missing") for n in g["notes"])


def test_wrong_name_banned_food_and_added_food_fail():
    case = by_id("en-chicken-fajitas")
    reply = perfect(case)
    chicken = next(i for i in reply["ingredients"] if "chicken" in i["line"])
    chicken["name"] = "chicken thigh"
    reply["ingredients"].append({"line": "Serve with tortilla shells", "name": "wheat tortillas", "grams_total": 200,
                                 "units_total": 0, "guessed": True, "storage": "keeps", "pantry": False,
                                 "dry": False})
    reply["ingredients"].append({"line": "2 cups cooked rice", "name": "rice", "grams_total": 150,
                                 "units_total": 0, "guessed": False, "storage": "keeps", "pantry": False,
                                 "dry": True})
    g = grade_case(case, reply, KNOWN)
    fails = " | ".join(g["fails"])
    assert "name chicken thigh (want chicken breast)" in fails
    assert "added wheat tortillas" in fails
    assert "added rice (150 g) from '2 cups cooked rice', which matches no line" in fails


def test_two_lines_of_one_food_add_up():
    case = by_id("en-chicken-curry")
    reply = perfect(case)
    yog = next(i for i in reply["ingredients"] if "coconut yogurt" in i["line"])
    reply["ingredients"].remove(yog)
    for line, grams in (("100 ml coconut yogurt", 100), ("150 ml coconut yogurt", 150)):
        reply["ingredients"].append({**yog, "line": line, "name": "coconut yogurt", "grams_total": grams})
    g = grade_case(case, reply, KNOWN)
    assert g["passed"], g["fails"]
    row = next(r for r in g["rows"] if "coconut yogurt" in r["line"])
    assert row["grams"] == 250


def test_line_score_ignores_numbers_units_and_accents():
    assert line_score("125 g de jamon york", "* 125 g de jamón york") == 1.0
    assert line_score("1 red bell pepper", "1 green bell pepper") < line_score("1 red bell pepper", "1 red bell pepper")


def test_invalid_reply_fails():
    case = by_id("en-frittata")
    g = grade_case(case, {"title": "x"}, KNOWN)
    assert not g["passed"] and g["fails"][0].startswith("reply breaks the contract")
    assert not grade_case(case, None, KNOWN)["passed"]


def test_prompt_holds_paste_and_known_foods():
    case = by_id("es-huevos-flamenca")
    p = import_prompt(case["paste"], known_ingredients=foods())
    assert "{{" not in p["system"] + p["user"]
    assert "Comensales: 4" in p["user"] and "extra virgin olive oil" in p["user"]
    assert "WHOLE recipe" in p["system"]


def _gemini_response(reply):
    body = {"choices": [{"message": {"content": json.dumps(reply)}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 2000, "completion_tokens": 800, "total_tokens": 2800}}
    return 200, json.dumps(body).encode()


def test_run_live_retries_once_writes_replies_and_scores(tmp_path):
    cases = [by_id("en-frittata"), by_id("es-filete-pollo")]
    sent = []

    def transport(url, headers, body):
        sent.append((url, headers, json.loads(body)))
        req = sent[-1][2]
        case = cases[1] if "Comensales" in req["messages"][1]["content"] else cases[0]
        if case is cases[1] and len(req["messages"]) == 2:
            return _gemini_response({"title": "bad"})  # breaks the contract: gets its errors back once
        return _gemini_response(perfect(case))

    runner, stopped = imp.run_live("t1", cases, 1.0, "AIzaFAKEKEY123456", "gemini-3.6-flash", 0,
                                   transport=transport, replies=tmp_path / "replies", log=lambda *_: None)
    assert stopped is None and len(sent) == 3
    assert all(h["user-agent"] == "SmartBite" for _, h, _ in sent)
    assert "reasoning_effort" not in sent[0][2] and sent[0][2]["model"] == "gemini-3.6-flash"
    assert "did not pass the checks" in sent[2][2]["messages"][-1]["content"]
    s = imp.score("t1", replies=tmp_path / "replies", results=tmp_path / "results", cases=cases)
    assert s["passed"] == 2 and s["calls"] == 3
    stored = (tmp_path / "replies" / "t1" / "en-frittata.json").read_text()
    assert "AIzaFAKEKEY123456" not in stored
    assert "**2 of 2 cases pass**" in (tmp_path / "results" / "t1.md").read_text()
    with pytest.raises(live.LiveError):
        imp.run_live("t1", cases, 1.0, "k", "gemini-3.6-flash", 0, transport=transport, replies=tmp_path / "replies")


def test_resume_reruns_only_provider_errors(tmp_path):
    cases = [by_id("en-frittata"), by_id("es-filete-pollo"), by_id("en-tuna-salad")]
    calls = []

    def first(url, headers, body):
        calls.append(1)
        content = json.loads(body)["messages"][1]["content"]
        if "Comensales" in content:
            return 503, json.dumps({"error": {"message": "high demand"}}).encode()
        if "Tuna Salad\n" in content:
            return _gemini_response({**perfect(by_id("en-tuna-salad")), "servings": 4})  # a model miss: kept
        return _gemini_response(perfect(by_id("en-frittata")))

    imp.run_live("r1", cases, 1.0, "k", "gemini-3.6-flash", 0, transport=first, replies=tmp_path, log=lambda *_: None)
    assert len(calls) == 3
    seen = []

    def second(url, headers, body):
        seen.append(json.loads(body)["messages"][1]["content"])
        return _gemini_response(perfect(by_id("es-filete-pollo")))

    imp.run_live("r1", cases, 1.0, "k", "gemini-3.6-flash", 0, transport=second, replies=tmp_path,
                 log=lambda *_: None, resume=True)
    assert len(seen) == 1 and "Comensales" in seen[0]
    s = imp.score("r1", replies=tmp_path, results=tmp_path / "res", cases=cases)
    assert [g["passed"] for g in s["results"]] == [True, True, False]


def test_anthropic_run_uses_recipe_settings(tmp_path):
    case = by_id("en-frittata")
    sent = []

    def transport(url, headers, body):
        sent.append((url, headers, json.loads(body)))
        reply = {"content": [{"type": "text", "text": json.dumps(perfect(case))}], "stop_reason": "end_turn",
                 "usage": {"input_tokens": 2000, "output_tokens": 900}}
        return 200, json.dumps(reply).encode()

    imp.run_live("a1", [case], 1.0, "sk-ant-FAKE", "claude-sonnet-5-5", 0, transport=transport, replies=tmp_path,
                 log=lambda *_: None, provider="anthropic")
    url, headers, body = sent[0]
    assert url == live.ANTHROPIC_URL and headers["user-agent"] == "SmartBite"
    assert body["model"] == "claude-sonnet-5-5" and body["output_config"] == {"effort": "medium"}
    s = imp.score("a1", replies=tmp_path, results=tmp_path / "res", cases=[case])
    assert s["passed"] == 1 and s["model"] == "claude-sonnet-5-5"


def test_a_step_naming_two_foods_files_each_under_its_own_line():
    case = by_id("en-chicken-curry")
    reply = perfect(case)
    step = "Finely chop fresh coriander and a dash of lemon juice to the curry."
    reply["ingredients"].append({"line": step, "name": "fresh coriander", "grams_total": 5, "units_total": 0,
                                 "guessed": True, "storage": "fresh", "pantry": False, "dry": False})
    g = grade_case(case, reply, KNOWN)
    assert g["passed"], g["fails"]
    lemon = next(r for r in g["rows"] if r["line"] == "Juice of 1/2 lemon")
    assert "fresh coriander" not in lemon["got"]
    # a wrong name is still caught on its own line
    reply = perfect(case)
    next(i for i in reply["ingredients"] if i["line"] == "4 lb chicken")["name"] = "chicken"
    assert any("name chicken" in f for f in grade_case(case, reply, KNOWN)["fails"])


def test_piece_lines_are_graded_on_the_table_grams():
    case = by_id("es-huevos-flamenca")
    reply = perfect(case)
    potato = next(i for i in reply["ingredients"] if i["line"] == "4 patatas grandes")
    potato.update(grams_total=800, pieces={"count": 4, "size": "large"})  # model guess 800 g, table 4 x 369 g
    g = grade_case(case, reply, KNOWN)
    assert g["passed"], g["fails"]
    row = next(r for r in g["rows"] if r["line"] == "4 patatas grandes")
    assert row["grams"] == 1476.0 and row["pieces"] == [{"count": 4, "size": "large"}]
    potato["pieces"] = {"count": 4, "size": "medium"}  # wrong size word: 852 g, outside the window
    assert not grade_case(case, reply, KNOWN)["passed"]


def test_resume_refuses_after_the_prompt_changed(tmp_path, monkeypatch):
    case = by_id("en-frittata")
    imp.run_live("p1", [case], 1.0, "k", "gemini-3.6-flash", 0, transport=lambda *a: (503, b"{}"), replies=tmp_path,
                 log=lambda *_: None)
    assert json.loads((tmp_path / "p1" / "en-frittata.json").read_text())["prompt_sha"]
    monkeypatch.setattr(imp, "_sha", lambda path: "another")
    with pytest.raises(live.LiveError, match="another prompt"):
        imp.run_live("p1", [case], 1.0, "k", "gemini-3.6-flash", 0, transport=lambda *a: (503, b"{}"),
                     replies=tmp_path, log=lambda *_: None, resume=True)


def test_an_unknown_food_must_be_the_right_food():
    case = by_id("es-filete-pollo")
    reply = perfect(case)
    leek = next(i for i in reply["ingredients"] if i["line"] == "1 tallo de porro")
    leek["name"] = "leeks, raw"
    assert grade_case(case, reply, KNOWN)["passed"]
    leek["name"] = "banana bread"  # not on the app's list, but not a leek either
    assert any("name banana bread" in f for f in grade_case(case, reply, KNOWN)["fails"])
