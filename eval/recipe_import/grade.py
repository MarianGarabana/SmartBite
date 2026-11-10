"""Code grader for the paste-a-recipe import (decided 2026-11-09). No model grader: names, grams and servings are all
checked in code against cases.json (built from key.json by build_key.py).

A case passes when all of these hold:
- the reply is a valid import Output (docs/contracts/import.schema.json); grams are checked after code weighs the
  piece lines (smartbite_engine/pieces.py; the web app needs its JS port before it shows the same grams),
- servings equal the key's (null when the text states none),
- every required food is there under an accepted name, with grams (eggs: units) inside its window,
- no food from must_not_include, and no food that matches no line of the paste.
Foods that are not required (salt, spices, dried herbs) and optional ones (a food that may or may not be counted) are
reported, never failed, unless they break must_not_include.

Matching a reply ingredient to a key line: the line words it copied (numbers, units and small words left out) against
the key line's words, plus a bonus when its name is one the key line accepts. Lines that accept the name come first
(when they share at least a quarter of the wording); each ingredient goes to its best line;
several ingredients may share one line (a line that lists several spices, or a food written on two lines).
"""
import re
import unicodedata

from smartbite_engine.contracts import validate_output
from smartbite_engine.names import foods
from smartbite_engine.pieces import apply_pieces

CONTRACT = "import.schema.json"
MIN_SCORE = 0.5  # below this an ingredient matches no line of the paste
MIN_SHARED = 0.25  # a line that accepts the name still needs this much of the wording in common
STOP = set("""
a an and or of the to for with in on into at as about taste fresh ground chopped diced minced sliced shredded peeled
drained can cans large medium small big ripe
g gram grams kg ml l litre liter litro lb lbs pound pounds oz ounce ounces cup cups tbsp tablespoon tablespoons tsp
teaspoon teaspoons pinch clove cloves stalk stalks steps line lines twice
de del la las el los y o con al a en un una unos unas gusto grande grandes
""".split())


def words(text):
    """Content words: accents and punctuation gone, numbers and STOP words left out."""
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z]+", plain) if w not in STOP and len(w) > 1}


def line_score(key_line, reply_line):
    k, r = words(key_line), words(reply_line)
    if not k or not r:
        return 0.0
    both = len(k & r)
    return max(both / len(k), both / len(r))


def unknown_ok(name, food):
    """An unlisted name passes an UNKNOWN line only when it contains one of the key's words for it ("leek")."""
    plain = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return any(w in plain for w in food.get("unknown_names", []))


def accepted(name, accept, known, food):
    if "ANY" in accept:
        return True
    plain = (name or "").strip().lower()
    if plain in accept:
        return True
    return "UNKNOWN" in accept and plain not in known and unknown_ok(name, food)


def name_bonus(name, accept, known, food):
    plain = (name or "").strip().lower()
    if plain in accept:
        return 1.0
    if "ANY" in accept or ("UNKNOWN" in accept and plain not in known and unknown_ok(name, food)):
        return 0.3
    return 0.0


def assign(case, ingredients, known):
    """{key food index: [ingredient index, ...]} and the ingredient indexes that match no line."""
    out, extra = {}, []
    for j, ing in enumerate(ingredients):
        # First the lines that accept this name and share some words with it: a step that names two foods ("chop
        # fresh coriander and a dash of lemon juice") must not file the coriander under the lemon line. Only when no
        # such line exists does the best wording win, so a wrong name ("chicken" for "4 lb chicken") is still caught.
        best, best_i = 0.0, None
        for i, food in enumerate(case["foods"]):
            words_s = line_score(food["line"], ing.get("line", ""))
            if words_s >= MIN_SHARED and accepted(ing.get("name"), food["accept"], known, food):
                s = words_s + name_bonus(ing.get("name"), food["accept"], known, food)
                if s > best:
                    best, best_i = s, i
        if best_i is None:
            for i, food in enumerate(case["foods"]):
                s = line_score(food["line"], ing.get("line", "")) + name_bonus(ing.get("name"), food["accept"], known, food)
                if s > best:
                    best, best_i = s, i
        if best_i is None or best < MIN_SCORE:
            extra.append(j)
        else:
            out.setdefault(best_i, []).append(j)
    return out, extra


def _fmt(x):
    return f"{x:g}" if isinstance(x, (int, float)) else str(x)


def grade_case(case, reply, known=None):
    """{"id", "passed", "fails": [...], "notes": [...], "rows": [...]} for one case. reply: the parsed JSON or None."""
    known = set(foods()) if known is None else known
    result = {"id": case["id"], "passed": False, "fails": [], "notes": [], "rows": [], "servings": None}
    if reply is None:
        result["fails"].append("no valid reply")
        return result
    errors = validate_output(reply, CONTRACT)
    if errors:
        result["fails"].append("reply breaks the contract: " + "; ".join(errors[:5]))
        return result
    reply = apply_pieces(reply)  # piece lines weighed by code (Python now; the web app's JS port is still to come)
    ings = reply["ingredients"]
    result["servings"] = reply["servings"]
    if reply["servings"] != case["servings"] and reply["servings"] not in case.get("servings_also_ok", []):
        want = "none (the app asks)" if case["servings"] is None else case["servings"]
        result["fails"].append(f"servings {reply['servings']!r}, want {want}")

    matched, extra = assign(case, ings, known)
    for i, food in enumerate(case["foods"]):
        got = [ings[j] for j in matched.get(i, [])]
        level = "fail" if food["required"] and not food["optional"] else "note"
        row = {"line": food["line"], "accept": food["accept"], "got": [g["name"] for g in got], "grams": None,
               "window": None, "ok": True, "level": level,
               "pieces": [g["pieces"] for g in got if g.get("grams_from") == "pieces"]}
        problems = []
        if not got:
            if not food["optional"]:
                problems.append("missing")
        else:
            wrong = [g["name"] for g in got if not accepted(g["name"], food["accept"], known, food)]
            if wrong:
                problems.append(f"name {', '.join(wrong)} (want {' or '.join(food['accept'])})")
            check = food["check"]
            if check and not wrong:
                if check["kind"] == "eggs":
                    value = sum(g["units_total"] for g in got)
                    row["grams"], row["window"] = f"{_fmt(value)} eggs", f"{check['expected']} eggs"
                else:
                    value = sum(g["grams_total"] for g in got)
                    row["grams"], row["window"] = round(value, 1), f"{_fmt(check['low'])} to {_fmt(check['high'])}"
                if not check["low"] <= value <= check["high"]:
                    problems.append(f"amount {_fmt(round(value, 1))} outside {_fmt(check['low'])} to "
                                    f"{_fmt(check['high'])}")
            elif got:
                row["grams"] = round(sum(g["grams_total"] for g in got), 1)
        if problems:
            row["ok"] = False
            row["problem"] = "; ".join(problems)
            (result["fails"] if level == "fail" else result["notes"]).append(f"{food['line']}: {row['problem']}")
        result["rows"].append(row)

    banned = {n.lower() for n in case.get("must_not_include", [])}
    for ing in ings:
        if ing["name"].strip().lower() in banned:
            result["fails"].append(f"added {ing['name']} (the text only suggests it, or it is water)")
    for j in extra:
        ing = ings[j]
        result["fails"].append(f"added {ing['name']} ({_fmt(ing['grams_total'])} g) from {ing['line']!r}, "
                               "which matches no line of the recipe")
        result["rows"].append({"line": "(no line)", "accept": [], "got": [ing["name"]],
                               "grams": round(ing["grams_total"], 1), "window": None, "ok": False, "level": "fail",
                               "problem": "added"})
    result["passed"] = not result["fails"]
    return result
