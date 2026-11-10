"""Prompt files in prompts/ filled with the form, the Kitchen Profile and the request data.

The templates are plain text so the web app (JS) can use the same files: split on the "<!-- system -->" and
"<!-- user -->" lines, drop other HTML comments, replace each {{name}} with its text.
"""
import json
import math
import re
from pathlib import Path

from .generic_packs import load_packs, pack_entry
from .names import canonical

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
DEFAULT_PROFILE = PROMPTS / "kitchen-profile.default.json"
MARKER = re.compile(r"^<!-- (system|user) -->[ \t]*$", re.M)
COMMENT = re.compile(r"<!--.*?-->", re.S)
PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")
GEAR_WORDS = {"microwave_only": "microwave only", "oven": "oven", "air_fryer": "air fryer", "no_blender": "no blender"}
NO_KNOWN = "(none listed: use plain English food names)"
MAX_ATTEMPTS = 3  # the first recipe plus up to 2 reruns
INCREASE_CAP = 0.15  # on a rerun a bought ingredient grows at most 15% over the first recipe
MACRO_FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
EPS = 1e-9  # keeps 54.0 from flooring to 53 when the float product lands just under it


def load_template(name):
    """{"system": text, "user": text} from prompts/<name>.md, placeholders still in."""
    text = (PROMPTS / f"{name}.md").read_text(encoding="utf-8")
    parts = MARKER.split(text)
    found = dict(zip(parts[1::2], parts[2::2]))
    if set(found) != {"system", "user"}:
        raise ValueError(f"prompts/{name}.md needs one system and one user marker, found {sorted(found)}")
    return {k: COMMENT.sub("", v).strip() for k, v in found.items()}


def fill(text, values):
    """Replace every {{name}}; a placeholder with no value is an error, so no prompt goes out half filled."""
    missing = sorted(set(PLACEHOLDER.findall(text)) - set(values))
    if missing:
        raise KeyError(f"no value for placeholders {missing}")
    out = PLACEHOLDER.sub(lambda m: str(values[m.group(1)]), text)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def render(name, values):
    template = load_template(name)
    return {part: fill(text, values) for part, text in template.items()}


def default_profile():
    return json.loads(DEFAULT_PROFILE.read_text(encoding="utf-8"))


def _number(value):
    return f"{value:g}" if isinstance(value, float) else str(value)


def field_line(field):
    """One profile field as prompt text, or None when the user left it empty."""
    value = field.get("value")
    if value is None or value == "" or value == []:
        return None
    if field["type"] == "text":
        return str(value).strip() or None
    shown = ", ".join(str(v).strip() for v in value if str(v).strip()) if field["type"] == "list" else _number(value)
    if not shown:
        return None
    return field.get("line", "{value}").replace("{value}", shown)


def render_profile(profile=None):
    """Kitchen Profile JSON -> the text the agents read. Sections with no lines left are skipped."""
    profile = profile or default_profile()
    blocks = []
    for section in profile["sections"]:
        lines = [line for line in map(field_line, section["fields"]) if line]
        if not lines:
            continue
        if section.get("plain"):
            blocks.append("\n".join(lines))
        else:
            blocks.append(f"{section['label']}:\n" + "\n".join(f"- {line}" for line in lines))
    return "\n\n".join(blocks)


def _get(form, key, default=None):
    value = form.get(key, default) if isinstance(form, dict) else getattr(form, key, default)
    return default if value is None else value


def target_ranges(form):
    """OK ranges per serving, the same rule as meal.macro_check, rounded inward so a number in the range passes:
    {"kcal": (low, high), "protein_g": (low, high)}. kcal within 10% of the target, protein 90% to 120%."""
    kcal, protein = _get(form, "kcal_target", 450), _get(form, "protein_g_target", 45)
    return {"kcal": (math.ceil(kcal * 0.9 - EPS), math.floor(kcal * 1.1 + EPS)),
            "protein_g": (math.ceil(protein * 0.9 - EPS), math.floor(protein * 1.2 + EPS))}


def form_text(form):
    """The Make Your Meal form as short lines. form: a MealForm or a dict with the same fields."""
    servings = _get(form, "servings")
    ranges = target_ranges(form)
    lines = [f"Craving: {_get(form, 'craving')}", f"Servings: {servings}",
             f"Targets per serving: {_get(form, 'kcal_target', 450):.0f} kcal (OK from {ranges['kcal'][0]} to "
             f"{ranges['kcal'][1]}), {_get(form, 'protein_g_target', 45):.0f} g protein (OK from "
             f"{ranges['protein_g'][0]} to {ranges['protein_g'][1]} g)"]
    if _get(form, "carbs_g_max"):
        lines.append(f"Carbs max per serving: {_get(form, 'carbs_g_max'):.0f} g")
    if _get(form, "fat_g_max"):
        lines.append(f"Fat max per serving: {_get(form, 'fat_g_max'):.0f} g")
    budget = _get(form, "budget_total_eur")
    if budget:
        lines.append(f"Budget: {budget:.2f} EUR total for all {servings} servings "
                     f"({budget / servings:.2f} EUR per serving), counted on whole packs bought")
    if _get(form, "exclude"):
        lines.append(f"Foods I do NOT want: {', '.join(_get(form, 'exclude'))}")
    if _get(form, "time_limit_min"):
        lines.append(f"Time limit: {_get(form, 'time_limit_min')} min")
    if _get(form, "gear"):
        lines.append(f"Cooking gear: {', '.join(GEAR_WORDS.get(g, g) for g in _get(form, 'gear'))}")
    lines.append(f"Reheat at work: {'yes' if _get(form, 'reheat_at_work', False) else 'no'}")
    lines.append(f"Keep leftovers low: {'yes' if _get(form, 'keep_leftovers_low', True) else 'no'}")
    return "\n".join(lines)


def english(name):
    """The food's English key when it is a known food, else the name as given."""
    return canonical(name) or name


def inspiration_text(dishes):
    if not dishes:
        return "(none picked: use real dishes you know)"
    return "\n".join(f"- {d['name']} ({d['cuisine']}, {d['style']}): "
                     f"{', '.join(map(english, d['core']))}. {d['method']}" for d in dishes)


def known_text(names):
    """Known food names in English, each once, in the order given."""
    return ", ".join(dict.fromkeys(map(english, names))) if names else NO_KNOWN


def pack_hints_text(hints):
    """Hints as text lines, or dicts {ingredient, pack_grams, sold_by} from the generic pack options."""
    lines = []
    for h in hints or []:
        if isinstance(h, str):
            lines.append(f"- {h}")
            continue
        food = english(h["ingredient"])
        if h.get("sold_by") == "per_kg":
            lines.append(f"- {food}: loose, sold per {h.get('pack_grams') or 1000:g} g")
        elif h.get("sold_by") == "per_unit":
            lines.append(f"- {food}: pack of {h.get('units_per_pack')} units")
        else:
            lines.append(f"- {food}: {h['pack_grams']:g} g pack")
    return "\n".join(lines) or "(none known: pick usual portions)"


def pack_hint_foods(idea, rerun=None):
    """Foods whose pack sizes the recipe prompt lists: the idea's main foods, plus the bought (non-pantry) foods of
    the last recipe on a rerun. Same as packHintFoods in web/lib/llm.js."""
    previous = (rerun or {}).get("previous") or {}
    return list(idea.get("main_ingredients") or []) + [i["name"] for i in previous.get("ingredients") or []
                                                       if not i.get("pantry")]


def pack_hints_for(names, packs=None):
    """Pack hints for these foods only (pack_hint_foods): one per food key with a typical pack size, sorted by key,
    in the dict shape pack_hints_text reads."""
    packs = load_packs() if packs is None else packs
    found = {}
    for name in names or ():
        hit = pack_entry(str(name), packs)
        if hit:
            found[hit[0]] = hit[1]
    return [{"ingredient": k, "sold_by": e["sold_by"], "pack_grams": e.get("default_grams"),
             "units_per_pack": e.get("units_per_pack")} for k, e in sorted(found.items())]


def gram_limits(first_recipe):
    """The 15% cap on increases, per bought (non-pantry) ingredient of the first recipe. Eggs in units."""
    out = []
    for ing in (first_recipe or {}).get("ingredients") or []:
        if ing.get("pantry"):
            continue
        units = ing.get("units_per_serving") or 0
        if units > 0:
            out.append({"name": ing["name"], "first_units": units,
                        "max_units": math.floor(units * (1 + INCREASE_CAP) * 10 + EPS) / 10})
        else:
            grams = ing["grams_per_serving"]
            out.append({"name": ing["name"], "first_grams": grams,
                        "max_grams": math.floor(grams * (1 + INCREASE_CAP) + EPS)})
    return out


def rerun_info(meal, first_recipe, attempt, max_attempts=MAX_ATTEMPTS):
    """What the rerun block needs, from an evaluated recipe (meal.evaluate output, or the /api/evaluate reply):
    the last recipe, macros per serving and per ingredient computed in code, the change requests, unknown foods and
    the gram limits from the first recipe."""
    ev = meal["evaluation"]
    servings = (meal.get("form") or {}).get("servings") or meal["recipe"]["servings"]
    macros = ev["macros"]
    lines = [{"name": l["name"], "grams": l["grams"] / servings,
              **{k: (l["amount"].get(k) or 0) / servings for k in MACRO_FIELDS}} for l in macros.get("lines") or []]
    return {"attempt": attempt, "max_attempts": max_attempts, "previous": meal["recipe"],
            "per_serving": {k: macros["per_serving"].get(k) or 0 for k in MACRO_FIELDS}, "lines": lines,
            "misses": list(macros.get("misses") or []), "change_requests": list(ev.get("change_requests") or []),
            "unresolved": list(macros.get("unresolved") or []), "limits": gram_limits(first_recipe)}


def _macro_line(m, places=0):
    return (f"{m['kcal']:.0f} kcal, {m['protein_g']:.{places}f} g protein, {m['carbs_g']:.{places}f} g carbs, "
            f"{m['fat_g']:.{places}f} g fat")


def retry_text(rerun, form=None):
    """RERUN block for the user part: attempt, the last recipe, macros computed in code, the problems found and the
    gram limits. Empty on the first try (rerun None)."""
    if not rerun:
        return ""
    out = [f"\nRERUN: attempt {rerun['attempt']} of {rerun['max_attempts']}. Code computed packs and macros from "
           f"your last recipe and found problems. Fix them and return the full corrected recipe.",
           "", "YOUR PREVIOUS RECIPE:", json.dumps(rerun["previous"], ensure_ascii=False)]
    if rerun.get("per_serving"):
        out += ["", "MACROS PER SERVING, COMPUTED IN CODE:"]
        out += [f"- {l['name']}, {l['grams']:.0f} g: {_macro_line(l)}" for l in rerun.get("lines") or []]
        out.append(f"Total: {_macro_line(rerun['per_serving'], 1)}")
        if form is not None:
            ranges = target_ranges(form)
            ok = [f"kcal {ranges['kcal'][0]} to {ranges['kcal'][1]}",
                  f"protein {ranges['protein_g'][0]} to {ranges['protein_g'][1]} g"]
            if _get(form, "carbs_g_max"):
                ok.append(f"carbs at most {_get(form, 'carbs_g_max'):.0f} g")
            if _get(form, "fat_g_max"):
                ok.append(f"fat at most {_get(form, 'fat_g_max'):.0f} g")
            out.append("OK ranges: " + ", ".join(ok))
    if rerun.get("unresolved"):
        out.append("Unknown foods, left out of the totals (use a name from KNOWN INGREDIENTS): "
                   + ", ".join(rerun["unresolved"]))
    out += ["", "PROBLEMS TO FIX:"]
    out += [f"- {r['reason']} ({r.get('ingredient') or 'meal'}): {r.get('hint', '')}".rstrip(": ")
            for r in rerun.get("change_requests") or []] or ["- (none listed)"]
    if rerun.get("limits"):
        out += ["", "GRAM LIMITS (per serving, at most 15% over the first recipe; cuts are fine):"]
        for l in rerun["limits"]:
            if "max_units" in l:
                out.append(f"- {l['name']}: at most {l['max_units']:g} eggs (first recipe {l['first_units']:g})")
            else:
                out.append(f"- {l['name']}: at most {l['max_grams']:g} g (first recipe {l['first_grams']:g} g)")
    return "\n".join(out) + "\n"


def idea_prompt(form, *, profile=None, inspiration=(), known_ingredients=()):
    return render("idea", {"kitchen_profile": render_profile(profile), "form": form_text(form),
                           "inspiration": inspiration_text(inspiration), "known_ingredients": known_text(known_ingredients)})


def revision_prompt(form, idea, changes, *, profile=None, known_ingredients=()):
    return render("revision", {"kitchen_profile": render_profile(profile), "form": form_text(form),
                               "idea": json.dumps(idea, ensure_ascii=False), "changes": changes.strip(),
                               "known_ingredients": known_text(known_ingredients)})


def recipe_prompt(form, idea, *, profile=None, known_ingredients=(), pack_hints=(), rerun=None):
    """rerun: None on the first try, else rerun_info(...) for the RERUN block."""
    return render("recipe", {"kitchen_profile": render_profile(profile), "form": form_text(form),
                             "idea": json.dumps(idea, ensure_ascii=False),
                             "known_ingredients": known_text(known_ingredients),
                             "pack_hints": pack_hints_text(pack_hints),
                             "retry": retry_text(rerun, form), "servings": _get(form, "servings")})
