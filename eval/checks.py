"""Code checks on one stored reply set (ideas reply + recipe reply for one golden case). No model calls.

Each check returns {"check", "status": pass|fail|skip, "detail"}. The macro check needs a nutrition table
(per 100 g by food name); without one it is skipped.
"""
import json
import re
from pathlib import Path

from smartbite_engine.calc import EGG_GRAMS, Nutrition, scale, total
from smartbite_engine.contracts import parse_reply, validate_output
from smartbite_engine.names import canonical, pairs as name_pairs, plain, stems

PASS, FAIL, SKIP = "pass", "fail", "skip"
NAME_MAX = 60
EGG_SIZE = "M"
MACRO_TOLERANCE = 0.10  # kcal within 10% of target, protein at least 90% of target
PROTEIN_MAX_OVER = 0.20  # protein more than 20% over target is a miss
NUTRITION = Path(__file__).resolve().parents[1] / "data" / "open" / "nutrition" / "per-100g.json"

DRY_FOOD = re.compile(r"\b(arroz|rice|pasta|macarr\w*|espagu\w*|spaghetti|fideo\w*|noodles?|tallar\w*|penne|"
                      r"fusil\w*|orzo|lasa\w*|quinoa|quinua|cuscus|couscous)\b")
NOT_DRY_FOOD = re.compile(r"\b(cocid\w*|cooked|precocid\w*|lata|canned|microondas|microwave|vasito|pouch|harina|flour|"
                          r"leche|milk|bebida|drink|vinagre|vinegar|tortitas?|cakes?|crackers?|paste)\b|"
                          r"\bpasta de (curry|sesamo|miso|ajo|tahin\w*|cacahuete|aceituna\w*)\b")
MARKS_DRY = re.compile(r"\b(dry|dried|uncooked|raw|secos?|secas?|crudos?|crudas?|sin cocer)\b")
EGG = re.compile(r"\b(huevos?|eggs?)\b")
NOT_WHOLE_EGG = re.compile(r"\b(claras?|whites?|yemas?|yolks?|liquid\w*|pasta|noodles?|fideos?|polvo|powder)\b")
# Words left out when an excluded food is looked up in the other language: forms and cuts, not the food itself
MODIFIERS = {"cocido", "cocida", "cooked", "fresco", "fresca", "fresh", "congelado", "congelada", "frozen", "lata",
             "canned", "seco", "seca", "dry", "dried", "light", "bell", "claro", "natural", "integral", "wholemeal",
             "picado", "picada", "ground", "minced", "lomo", "loin", "pechuga", "breast", "contramuslo", "thigh",
             "solomillo", "tenderloin", "filete", "steak"}


def result(check, status, detail=""):
    return {"check": check, "status": status, "detail": detail}


def load_reply(value):
    """A stored reply is the raw reply text (parsed like the app does) or the JSON object itself."""
    if value is None:
        return None, ["no reply stored"]
    if isinstance(value, str):
        return parse_reply(value)
    return value, []


def _ideas(data):
    ideas = (data or {}).get("ideas") if isinstance(data, dict) else None
    return [i for i in ideas if isinstance(i, dict)] if isinstance(ideas, list) else []


def _ingredients(recipe):
    items = (recipe or {}).get("ingredients") if isinstance(recipe, dict) else None
    return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []


def _name(item):
    return str(item.get("name") or "")


def check_contract(check, data, parse_errors, contract):
    if parse_errors:
        return result(check, FAIL, "; ".join(parse_errors))
    errors = validate_output(data, contract)
    return result(check, FAIL, "; ".join(errors[:5])) if errors else result(check, PASS)


def check_four_ideas(ideas):
    return result("four_ideas", PASS) if len(ideas) == 4 else result("four_ideas", FAIL, f"got {len(ideas)} ideas")


def check_idea_names(ideas):
    if not ideas:
        return result("idea_names_60", FAIL, "no ideas")
    long = [f"{_name(i)!r} ({len(_name(i))})" for i in ideas if len(_name(i)) > NAME_MAX or not _name(i)]
    return result("idea_names_60", FAIL, "too long or empty: " + ", ".join(long)) if long else result("idea_names_60", PASS)


def check_servings(recipe, form):
    got = (recipe or {}).get("servings") if isinstance(recipe, dict) else None
    if got == form["servings"]:
        return result("recipe_servings", PASS)
    return result("recipe_servings", FAIL, f"servings {got}, form asks {form['servings']}")


def base_words(name):
    """Words of a food after names.canonical: the English key's words when the food is known, else its own words."""
    return stems(canonical(name) or name)


def missing_main_foods(idea, ingredients):
    """Main foods of the idea the recipe dropped. A food counts as kept when its first word is in an ingredient name,
    both names are the same food (same English key, so "pechuga de pollo" keeps "chicken breast"), or an ingredient
    is a specific kind of it: every base word of the main food is in the ingredient's base words, so "basmati rice"
    keeps "rice" and "arroz", "cherry tomatoes" keeps "tomato". Base words come after names.canonical."""
    have = set().union(*(stems(_name(i)) for i in ingredients)) if ingredients else set()
    keys = {canonical(_name(i)) for i in ingredients} - {None}
    bases = [base_words(_name(i)) for i in ingredients]
    return [f for f in idea.get("main_ingredients") or []
            if stems(f.split()[0] if f.split() else f) - have and canonical(f) not in keys
            and not any(base_words(f) <= b for b in bases)]


def check_keeps_main(idea, ingredients):
    if not idea:
        return result("keeps_main_ingredients", FAIL, "no picked idea")
    if not ingredients:
        return result("keeps_main_ingredients", FAIL, "recipe has no ingredients")
    missing = missing_main_foods(idea, ingredients)
    return result("keeps_main_ingredients", FAIL, "dropped: " + ", ".join(missing)) if missing \
        else result("keeps_main_ingredients", PASS)


def banned_words(exclude, pairs=None):
    """Word sets that mark an excluded food: the item itself plus its name in the other language, from the
    (alias, English key) pairs of data/open/aliases.json ("onion" also bans "cebolla"; "garbanzos" also bans
    "chickpea")."""
    pairs = name_pairs() if pairs is None else pairs
    out = []
    for item in exclude:
        target = stems(item)
        if not target:
            continue
        out.append(target)
        for name, en in pairs:
            for mine, other in ((name, en), (en, name)):
                if target <= stems(mine):
                    head = stems(other) - MODIFIERS
                    if head:
                        out.append(head)
    return out


def excluded_in(names, exclude, pairs=None):
    banned = banned_words(exclude, pairs)
    return [n for n in names if any(b <= stems(n) for b in banned)]


def check_no_excluded(form, ideas, ingredients, pairs=None):
    exclude = form.get("exclude") or []
    if not exclude:
        return result("no_excluded_food", PASS, "no exclusions in the form")
    names = [f for i in ideas for f in i.get("main_ingredients") or []] + [_name(i) for i in ingredients]
    hits = sorted(set(excluded_in(names, exclude, pairs)))
    return result("no_excluded_food", FAIL, "excluded food used: " + ", ".join(hits)) if hits \
        else result("no_excluded_food", PASS)


def needs_dry(name):
    text = plain(name)
    return bool(DRY_FOOD.search(text)) and not NOT_DRY_FOOD.search(text)


def check_dry_grams(ingredients):
    bad = []
    for i in ingredients:
        if not needs_dry(_name(i)):
            continue
        marked = i.get("dry") is True or MARKS_DRY.search(plain(f"{_name(i)} {i.get('note') or ''}"))
        if not marked:
            bad.append(_name(i))
    return result("dry_grams", FAIL, "not marked dry: " + ", ".join(bad)) if bad else result("dry_grams", PASS)


def is_whole_egg(name):
    text = plain(name)
    return bool(EGG.search(text)) and not NOT_WHOLE_EGG.search(text)


def check_eggs_in_units(ingredients):
    """Eggs: units_per_serving > 0 and grams = units x edible grams of one size class (S 42 to XL 69).
    Every other food has units_per_serving 0."""
    bad = []
    for i in ingredients:
        units, grams = i.get("units_per_serving") or 0, i.get("grams_per_serving") or 0
        if is_whole_egg(_name(i)):
            if not isinstance(units, (int, float)) or units <= 0:
                bad.append(f"{_name(i)}: no units_per_serving")
            elif not min(EGG_GRAMS.values()) * units - 0.5 <= grams <= max(EGG_GRAMS.values()) * units + 0.5:
                bad.append(f"{_name(i)}: {grams:g} g does not fit {units:g} eggs")
        elif units:
            bad.append(f"{_name(i)}: units_per_serving {units} on a food that is not eggs")
    return result("eggs_in_units", FAIL, "; ".join(bad)) if bad else result("eggs_in_units", PASS)


def check_grams(ingredients):
    if not ingredients:
        return result("grams_every_ingredient", FAIL, "recipe has no ingredients")
    bad = [_name(i) or "(no name)" for i in ingredients
           if isinstance(i.get("grams_per_serving"), bool) or not isinstance(i.get("grams_per_serving"), (int, float))
           or i["grams_per_serving"] <= 0]
    return result("grams_every_ingredient", FAIL, "no grams: " + ", ".join(bad)) if bad \
        else result("grams_every_ingredient", PASS)


def load_per_100g(path=NUTRITION):
    """{food key: Nutrition} from the nutrition table, or None when the file does not exist yet.
    Accepts {"foods": {name: values}} or {name: values}; values hold kcal, protein_g, carbs_g, fat_g
    directly or under "per_100g"."""
    path = Path(path)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    foods = data.get("foods", data) if isinstance(data, dict) else {}
    return per_100g_table(foods)


def per_100g_table(foods):
    table = {}
    for name, values in foods.items():
        if not isinstance(values, dict):
            continue
        values = values.get("per_100g", values)
        if all(isinstance(values.get(k), (int, float)) for k in ("kcal", "protein_g")):
            table[_key(name)] = Nutrition(*(values.get(k) or 0 for k in ("kcal", "protein_g", "carbs_g", "fat_g")))
    return table


def _key(name):
    """English key of a food (data/open/aliases.json), else its plain name."""
    return canonical(name) or plain(name)


def _lookup(name, table):
    bare = re.sub(r"\s*\(.*?\)", "", plain(name)).strip()
    return table.get(_key(name)) or table.get(_key(bare))


def macros_per_serving(ingredients, table):
    """(Nutrition per serving, names with no nutrition). Eggs use units x 51 g (size M)."""
    lines, missing = [], []
    for i in ingredients:
        per100 = _lookup(_name(i), table)
        if per100 is None:
            missing.append(_name(i))
            continue
        units = i.get("units_per_serving") or 0
        grams = units * EGG_GRAMS[EGG_SIZE] if units and is_whole_egg(_name(i)) else i.get("grams_per_serving") or 0
        lines.append(scale(per100, grams))
    return total(lines), missing


def macro_misses(per, form):
    misses = []
    kcal, protein = form.get("kcal_target", 450), form.get("protein_g_target", 45)
    if abs(per.kcal - kcal) > MACRO_TOLERANCE * kcal:
        misses.append(f"kcal {per.kcal:.0f} vs target {kcal:.0f}")
    if per.protein_g < (1 - MACRO_TOLERANCE) * protein:
        misses.append(f"protein {per.protein_g:.0f} g vs target {protein:.0f} g")
    if per.protein_g > (1 + PROTEIN_MAX_OVER) * protein:
        misses.append(f"protein {per.protein_g:.0f} g is more than 20% over target {protein:.0f} g")
    if form.get("carbs_g_max") and per.carbs_g > form["carbs_g_max"]:
        misses.append(f"carbs {per.carbs_g:.0f} g over max {form['carbs_g_max']:.0f} g")
    if form.get("fat_g_max") and per.fat_g > form["fat_g_max"]:
        misses.append(f"fat {per.fat_g:.0f} g over max {form['fat_g_max']:.0f} g")
    return misses


def check_macros(ingredients, form, table):
    """Macros per serving vs the form targets. table: {name: Nutrition per 100 g} or None (check skipped)."""
    if table is None:
        return result("macros_vs_target", SKIP, "no nutrition table yet")
    if not ingredients:
        return result("macros_vs_target", FAIL, "recipe has no ingredients")
    per, missing = macros_per_serving(ingredients, table)
    if missing:
        return result("macros_vs_target", SKIP, "no nutrition for: " + ", ".join(missing))
    summary = f"{per.kcal:.0f} kcal, {per.protein_g:.0f} g protein, {per.carbs_g:.0f} g carbs, {per.fat_g:.0f} g fat"
    misses = macro_misses(per, form)
    return result("macros_vs_target", FAIL, "; ".join(misses) + f" ({summary})") if misses \
        else result("macros_vs_target", PASS, summary)


def picked_idea(ideas, reply, recipe):
    """The idea the recipe was written for: picked_idea_id in the reply file, else the recipe's idea_id, else the first."""
    wanted = reply.get("picked_idea_id") or (recipe.get("idea_id") if isinstance(recipe, dict) else None)
    for idea in ideas:
        if wanted is not None and idea.get("idea_id") == wanted:
            return idea
    return ideas[0] if ideas else None


CHECKS = ("ideas_json", "four_ideas", "idea_names_60", "recipe_json", "recipe_servings", "keeps_main_ingredients",
          "no_excluded_food", "dry_grams", "eggs_in_units", "grams_every_ingredient", "macros_vs_target")


def recipe_replies(reply):
    """Every recipe reply in order: the first recipe, then each rerun (reply["reruns"], text or object)."""
    reruns = reply.get("reruns") or []
    return [reply.get("recipe"), *(reruns if isinstance(reruns, list) else [reruns])]


def check_case(case, reply, table=None, pairs=None):
    """All checks for one golden case. reply: {"ideas": text or object, "picked_idea_id": "1", "recipe": text or object,
    "reruns": [text or object, ...] (optional)}. The recipe checks use the last recipe (the last rerun when there is one)."""
    form = case["form"]
    ideas_data, idea_errors = load_reply(reply.get("ideas"))
    recipe, recipe_errors = load_reply(recipe_replies(reply)[-1])
    ideas, ingredients = _ideas(ideas_data), _ingredients(recipe)
    return [
        check_contract("ideas_json", ideas_data, idea_errors, "idea.schema.json"),
        check_four_ideas(ideas),
        check_idea_names(ideas),
        check_contract("recipe_json", recipe, recipe_errors, "recipe.schema.json"),
        check_servings(recipe, form),
        check_keeps_main(picked_idea(ideas, reply, recipe), ingredients),
        check_no_excluded(form, ideas, ingredients, pairs),
        check_dry_grams(ingredients),
        check_eggs_in_units(ingredients),
        check_grams(ingredients),
        check_macros(ingredients, form, table),
    ]
