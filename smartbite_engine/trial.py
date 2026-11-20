"""Free trial (decided 2026-11-20): a visitor with no AI key makes up to 3 meals on Marian's Anthropic key.

The key stays on the server (env SMARTBITE_TRIAL_KEY, read by api/index.py) and pays only for SmartBite's own steps:
the browser sends structured inputs (form, Kitchen Profile, picked idea, changes, rerun facts) and this module builds
the prompt with smartbite_engine.prompts, the same text the browser builds for own-key users (web/test/prompts.test.mjs
checks the two match). Raw prompt text is never accepted, so the route is not an open Claude relay. Every reply is
checked like web/lib/llm.js (contract plus the browser's extra checks); on a failure the model gets the errors once.

The money cap is the prepaid balance on that key (10 USD, auto-reload off); 3 meals per browser is counted in the
browser. This module calls no network itself: `run` gets a `call(step, system, messages, timeout_s)` function.
"""
import json
import time

from .contracts import parse_reply, validate_output
from .inspiration import pick_dishes
from .names import foods, missing_main_foods
from .prompts import (
    MAX_ATTEMPTS,
    idea_prompt,
    pack_hint_foods,
    pack_hints_for,
    recipe_prompt,
    revision_prompt,
)

MODEL = "claude-haiku-5-5"  # Marian's choice for the trial (2026-11-20)
MEALS = 3  # per browser
MAX_TOKENS = 16000  # same as web/lib/llm.js
EFFORT = {"ideas": "low", "revision": "low", "recipe": "medium"}  # same as web/lib/llm.js
LABEL = {"ideas": "ideas", "revision": "changed idea", "recipe": "recipe"}  # same as web/lib/llm.js
STEPS = tuple(EFFORT)

MAX_SEED = 80
MAX_CHANGES = 500  # the "Want to change something?" box
MAX_PROFILE_JSON = 20_000
MAX_RERUN_JSON = 40_000
# Size caps (review 2026-11-20): every free-text field, in and out, so no field can carry a long instruction in or a
# long text back. The site's own values are far below them.
MAX_TEXT = 400  # any string in a request or a reply
MAX_IDEA_CHANGES = 1500  # idea.changes: the user's revisions joined with "; "
MAX_PROFILE_TEXT = 600  # a Kitchen Profile text field
MAX_LIST = 40  # any list
MAX_STEPS = 20  # recipe steps in a reply
MAX_STEP_TEXT = 500
# Time: one deadline per request, under the function's 300 s limit (vercel.json); a second call starts only with
# this much time left
DEADLINE_S = 270
MIN_CALL_S = 60
RERUN_KEYS = {"attempt", "max_attempts", "previous", "per_serving", "lines", "misses", "change_requests",
              "unresolved", "limits"}


class TrialError(Exception):
    """A problem the visitor can see. status: HTTP status for the reply; code: what the site does next."""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _bad(message):
    return TrialError(422, "bad_request", message)


def _rerun_errors(rerun):
    if not isinstance(rerun, dict) or set(rerun) != RERUN_KEYS:
        return [f"rerun: must have exactly the keys {sorted(RERUN_KEYS)}"]
    if len(json.dumps(rerun, ensure_ascii=False)) > MAX_RERUN_JSON:
        return [f"rerun: over {MAX_RERUN_JSON} characters"]
    errors = []
    if rerun["max_attempts"] != MAX_ATTEMPTS or rerun["attempt"] not in range(2, MAX_ATTEMPTS + 1):
        errors.append(f"rerun: attempt must be 2 to {MAX_ATTEMPTS} of {MAX_ATTEMPTS}")
    errors += validate_output(rerun["previous"], "recipe.schema.json")
    for key in ("lines", "misses", "change_requests", "unresolved", "limits"):
        if not isinstance(rerun[key], list) or len(rerun[key]) > 60:
            errors.append(f"rerun: {key} must be a list of at most 60")
    for item in rerun["change_requests"] if isinstance(rerun["change_requests"], list) else []:
        errors += validate_output(item, "common.schema.json", "ChangeRequest")
    numbers = [rerun["per_serving"], *(rerun["lines"] if isinstance(rerun["lines"], list) else [])]
    if not all(isinstance(m, dict) and all(isinstance(m.get(k), (int, float)) and not isinstance(m.get(k), bool)
                                           for k in ("kcal", "protein_g", "carbs_g", "fat_g")) for m in numbers):
        errors.append("rerun: per_serving and lines need numbers for kcal, protein_g, carbs_g and fat_g")
    return errors


def size_errors(value, path, text_max=MAX_TEXT, overrides=None):
    """Strings over their cap and lists over MAX_LIST, anywhere in value. overrides: {path: cap} for named fields."""
    overrides = overrides or {}
    cap = overrides.get(path, text_max)
    if isinstance(value, str):
        return [f"{path}: over {cap} characters"] if len(value) > cap else []
    if isinstance(value, list):
        errors = [f"{path}: over {MAX_LIST} items"] if len(value) > MAX_LIST else []
        for i, item in enumerate(value[:MAX_LIST]):
            errors += size_errors(item, f"{path}[]", text_max, overrides)
        return errors
    if isinstance(value, dict):
        return [e for k, v in value.items() for e in size_errors(v, f"{path}.{k}", text_max, overrides)]
    return []


def check_request(body):
    """Errors in a trial request (empty = fine). Shapes come from docs/contracts, sizes from the site's own limits."""
    if not isinstance(body, dict):
        return ["request body must be a JSON object"]
    step = body.get("step")
    if step not in STEPS:
        return [f"step must be one of {list(STEPS)}"]
    allowed = {"step", "form", "profile", "seed", "idea", "changes", "rerun"}
    errors = [f"unknown field: {k}" for k in sorted(set(body) - allowed)]
    errors += validate_output(body.get("form"), "common.schema.json", "MealForm")
    profile = body.get("profile")
    if profile is not None:
        if len(json.dumps(profile, ensure_ascii=False)) > MAX_PROFILE_JSON:
            errors.append(f"profile: over {MAX_PROFILE_JSON} characters")
        else:
            errors += validate_output(profile, "kitchen-profile.schema.json")
    if step == "ideas":
        seed = body.get("seed")
        if not isinstance(seed, str) or not 0 < len(seed) <= MAX_SEED:
            errors.append(f"seed: must be a string of 1 to {MAX_SEED} characters")
    else:
        errors += validate_output(body.get("idea"), "idea.schema.json", "Idea")
    if step == "revision":
        changes = body.get("changes")
        if not isinstance(changes, str) or not changes.strip() or len(changes) > MAX_CHANGES:
            errors.append(f"changes: must be text of 1 to {MAX_CHANGES} characters")
    if step == "recipe" and body.get("rerun") is not None:
        errors += _rerun_errors(body["rerun"])
    errors += size_errors(body.get("form"), "form")
    errors += size_errors(body.get("profile"), "profile", MAX_PROFILE_TEXT)
    errors += size_errors(body.get("idea"), "idea", overrides={"idea.changes": MAX_IDEA_CHANGES})
    errors += size_errors(body.get("rerun"), "rerun", MAX_STEP_TEXT)
    return errors


def reply_size_errors(data):
    """The reply's own size caps (stricter than the contracts): told to the model like any other check."""
    errors = size_errors(data, "reply", overrides={"reply.steps[]": MAX_STEP_TEXT})
    if isinstance(data, dict) and isinstance(data.get("steps"), list) and len(data["steps"]) > MAX_STEPS:
        errors.append(f"steps: at most {MAX_STEPS}, got {len(data['steps'])}")
    return errors


def ideas_errors(data):
    """Same checks as generateIdeas in web/lib/llm.js."""
    errors = validate_output(data, "idea.schema.json")
    if not errors:
        ids = [i["idea_id"] for i in data["ideas"]]
        if len(set(ids)) != len(ids):
            errors.append(f"idea_id values must all be different, got {', '.join(ids)}")
    return errors


def revision_errors(data, idea):
    """Same checks as reviseIdea in web/lib/llm.js."""
    errors = validate_output(data, "revision.schema.json")
    if not errors and data["idea"]["idea_id"] != idea["idea_id"]:
        errors.append(f'idea_id must stay "{idea["idea_id"]}", got "{data["idea"]["idea_id"]}"')
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


def build(body, packs=None):
    """(prompt, check) for a request that passed check_request, with the browser's inputs: 12 inspiration dishes for
    the seed, the English food keys, and pack hints for the recipe."""
    step, form, profile = body["step"], body["form"], body.get("profile")
    known = foods()
    if step == "ideas":
        dishes = pick_dishes(form.get("craving") or "", form.get("exclude") or [], seed=body["seed"])
        return idea_prompt(form, profile=profile, inspiration=dishes, known_ingredients=known), ideas_errors
    idea = body["idea"]
    if step == "revision":
        prompt = revision_prompt(form, idea, body["changes"], profile=profile, known_ingredients=known)
        return prompt, lambda d: revision_errors(d, idea)
    rerun = body.get("rerun")
    prompt = recipe_prompt(form, idea, profile=profile, known_ingredients=known,
                           pack_hints=pack_hints_for(pack_hint_foods(idea, rerun), packs), rerun=rerun)
    return prompt, lambda r: recipe_errors(r, idea, form)


def retry_message(errors):
    """Same text as retryMessage in web/lib/llm.js."""
    return ("Your reply did not pass the checks:\n" + "\n".join(f"- {e}" for e in errors)
            + "\n\nReply again with ONLY the corrected JSON object, no other text.")


def run(body, call, packs=None, clock=time.monotonic):
    """Checked data for one trial request. call(step, system, messages, timeout_s) -> (text, assistant content list)
    and raises TrialError for provider problems. At most 2 model calls, both inside DEADLINE_S."""
    errors = check_request(body)
    if errors:
        raise _bad("; ".join(errors[:5]))
    try:
        prompt, check = build(body, packs)
    except (KeyError, TypeError, ValueError) as e:  # a shape the contracts allow but the prompt code cannot use
        raise _bad(f"could not build the prompt: {type(e).__name__}") from e
    step = body["step"]
    deadline = clock() + DEADLINE_S
    messages = [{"role": "user", "content": prompt["user"]}]
    for attempt in (1, 2):
        left = deadline - clock()
        if left < MIN_CALL_S:
            raise TrialError(504, "too_slow", f"The {LABEL[step]} took too long. Try again.")
        text, content = call(step, prompt["system"], messages, left - 5)
        data, errors = parse_reply(text)
        if not errors:
            errors = check(data) or reply_size_errors(data)
        if not errors:
            return data
        if attempt == 2:
            raise TrialError(502, "invalid_reply", f"The {LABEL[step]} reply was not valid twice. Try again. "
                                                   f"Last problems: {'; '.join(errors[:5])}")
        messages = [*messages, {"role": "assistant", "content": content},
                    {"role": "user", "content": retry_message(errors)}]
    raise AssertionError("unreachable")
