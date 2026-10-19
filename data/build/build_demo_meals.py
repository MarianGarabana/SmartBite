"""Build the demo meals (web/demo/meals/<slug>.json) and their photos (web/public/demo/images/<slug>.jpg)
from the saved meals of the personal app. Decided 2026-10-19: 13 saved meals ship as demo meals.

    .venv/bin/python data/build/build_demo_meals.py --source <personal app>/meals

What is kept: form, picked idea, recipe (title, servings, prep time, steps, ingredients with grams and units).
Ingredient names become English food keys (data/open/aliases.json). Every store field is dropped (products, links,
prices, price dates, barcodes, counts, match and session data, nutrition sources of the personal app), personal
and store words in the text are rewritten (each edit is printed), and the evaluation (packs, macros, leftovers)
is computed again by smartbite_engine.meal.evaluate. Spanish titles, idea names, one-liners and steps become English
from data/build/demo-translations.json, so the slugs (and photo names) are English too. Photos are converted with macOS sips (JPEG, at most 1200 px
wide, quality 80); replaced photos are never copied.
"""
import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from smartbite_engine.contracts import validate_output  # noqa: E402
from smartbite_engine.meal import OPTIONAL_FOODS, evaluate  # noqa: E402
from smartbite_engine.names import canonical  # noqa: E402

OUT_MEALS = ROOT / "web" / "demo" / "meals"
OUT_IMAGES = ROOT / "web" / "public" / "demo" / "images"
FIXTURE = OUT_MEALS / "fixture-paprika-chicken-rice-bowl.json"
TRANSLATIONS = ROOT / "data" / "build" / "demo-translations.json"
MAX_WIDTH = 1200
JPEG_QUALITY = 80

# The 13 saved meals. 2026-10-05-bol-de-pechuga-con-arroz-y is left out: its -2 version is the one kept.
MEALS = (
    "2026-10-03-bol-de-pavo-picado-con-boniato",
    "2026-10-03-ensalada-de-atun-y-garbanzos-con",
    "2026-10-03-frittata-de-atun-con-verduras",
    "2026-10-03-lentejas-estofadas-clasicas-con-garbanzos-y",
    "2026-10-03-pechuga-de-pollo-al-curry-suave",
    "2026-10-03-pollo-asado-con-patatas-al-horno",
    "2026-10-04-pollo-al-horno-con-calabacin-y",
    "2026-10-05-bol-de-pechuga-con-arroz-y-2",
    "2026-10-05-ensalada-de-pasta-integral-atun-y",
    "2026-10-06-tuna-artichoke-whole-wheat-pasta-salad",
    "2026-10-09-chicken-salad-with-sweet-potato-walnuts",
    "2026-10-13-carrot-cake-overnight-oats-with-berries",
    "2026-10-13-korean-beef-bowl-with-peas-and-2",
)

# Word edits in text fields: (meal, field, old, new). field "steps" applies to every step.
WORD_EDITS = (
    ("2026-10-03-bol-de-pavo-picado-con-boniato", "steps", "en la oficina", "en el trabajo"),
    ("2026-10-03-pechuga-de-pollo-al-curry-suave", "steps", "en la oficina", "en el trabajo"),
    ("2026-10-04-pollo-al-horno-con-calabacin-y", "picked_idea.one_line", "at the office", "at work"),
)

# Whole-field rewrites where the old text held a brand, a product name or a pasted label, or ran over the
# 300-character craving limit: (meal, field, start of the old text, new text). The old text is never stored here.
REWRITES = (
    ("2026-10-13-carrot-cake-overnight-oats-with-berries", "form.craving",
     "I want to make overnight oats with Vanilla whey isolate protein powder",
     "I want to make overnight oats with vanilla whey isolate protein powder (30 g scoop), oats, chia seeds... "
     "I want it to be high fiber, high protein, high volume. Don't put the protein with budget, I already have it"),
    ("2026-10-13-carrot-cake-overnight-oats-with-berries", "picked_idea.changes",
     "could we add a bit of berries too?",
     "could we add a bit of berries too? | berries are fresh strawberries plus frozen blueberries, "
     "no other frozen berries or blackberries."),
    ("2026-10-13-korean-beef-bowl-with-peas-and-2", "form.craving",
     "I want to make a beef with peas and rice for meal prep",
     "I want to make a beef with peas and rice for meal prep, high protein, budget friendly, high fiber. "
     "I saw that I could mix brown rice with quinoa and lentils to add more fiber and protein. I want it to be "
     "450 calories and 40+g of protein. Other grain mixes that boost protein and fiber are welcome."),
)

FORM_FIELDS = ("craving", "exclude", "kcal_target", "protein_g_target", "carbs_g_max", "fat_g_max",
               "budget_total_eur", "servings", "keep_leftovers_low", "time_limit_min", "gear", "reheat_at_work")
IDEA_FIELDS = ("idea_id", "name", "one_line", "main_ingredients", "rough_macros", "image_prompt", "changes")
INGREDIENT_FIELDS = ("name", "grams_per_serving", "units_per_serving", "storage", "pantry", "dry", "note",
                     "leftover_plan")
MAX_MAIN = 8


def _words(*parts):
    """Banned words, stored reversed so this file and the tests never spell them."""
    return re.compile(r"\b(" + "|".join(p[::-1] for p in parts) + r")\b", re.I)


# Personal and store words that must not appear anywhere in a demo meal
BANNED = _words("nairam", "dirdam", "opmacla", "nahcua", "acdeb", "eciffo", "anicifo", "reh", "klub", "anirrat")


def slugify(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def _get(doc, field):
    part, _, key = field.partition(".")
    return doc[part][key]


def _set(doc, field, value):
    part, _, key = field.partition(".")
    doc[part][key] = value


def english(name, unresolved):
    key = canonical(name)
    if key is None:
        unresolved.append(name)
        return name
    return key


def load_translations():
    return json.loads(TRANSLATIONS.read_text(encoding="utf-8"))["meals"]


def _numbers(text):
    return sorted(re.findall(r"\d+", text))


def translate(stem, doc, entry, edits):
    """English text from demo-translations.json. Grams live in the ingredients and are never touched; each
    translated step and one-liner must keep exactly the numbers of the text it replaces."""
    recipe, idea = doc["recipe"], doc["picked_idea"]
    for key, field in (("title", "recipe.title"), ("idea_name", "picked_idea.name"), ("one_line", "picked_idea.one_line"),
                       ("craving", "form.craving"), ("changes", "picked_idea.changes")):
        if key in entry:
            if key in ("one_line", "craving", "changes") and _numbers(entry[key]) != _numbers(_get(doc, field) or ""):
                raise SystemExit(f"{stem}: translated {key} changes the numbers")
            _set(doc, field, entry[key])
            edits.append(f"{stem}: {field} -> {entry[key]!r}")
    if "steps" in entry:
        if len(entry["steps"]) != len(recipe["steps"]):
            raise SystemExit(f"{stem}: {len(entry['steps'])} translated steps for {len(recipe['steps'])} steps")
        for i, (old, new) in enumerate(zip(recipe["steps"], entry["steps"])):
            if _numbers(old) != _numbers(new):
                raise SystemExit(f"{stem}: step {i + 1}: translation changes the numbers")
        recipe["steps"] = list(entry["steps"])
        edits.append(f"{stem}: {len(entry['steps'])} steps translated")
    for before, after in entry.get("words", []):
        texts = recipe["steps"] + [idea.get("one_line", "")]
        if not any(before in t for t in texts):
            raise SystemExit(f"{stem}: word not found in steps or one_line: {before!r}")
        recipe["steps"] = [t.replace(before, after) for t in recipe["steps"]]
        if idea.get("one_line"):
            idea["one_line"] = idea["one_line"].replace(before, after)
        edits.append(f"{stem}: {before!r} -> {after!r}")


def convert(stem, saved, edits, unresolved, translations=None):
    form = {k: saved["form"][k] for k in FORM_FIELDS if k in saved["form"]}
    idea = {k: saved["picked_idea"][k] for k in IDEA_FIELDS if k in saved["picked_idea"]}
    old = saved["recipe"]
    ingredients = []
    for ing in old["ingredients"]:
        new = {k: ing[k] for k in INGREDIENT_FIELDS if k in ing}
        new["name"] = english(ing["name"], unresolved)
        ingredients.append(new)
    recipe = {k: old[k] for k in ("idea_id", "title", "servings", "prep_time_min") if k in old}
    recipe["ingredients"] = ingredients
    recipe["steps"] = list(old["steps"])

    if idea.get("main_ingredients"):
        idea["main_ingredients"] = list(dict.fromkeys(english(n, unresolved) for n in idea["main_ingredients"]))
    else:
        # Older meals have no main_ingredients: the recipe's bought foods (no pantry or optional items), in order
        main = [i["name"] for i in ingredients if not i["pantry"] and i["name"] not in OPTIONAL_FOODS]
        idea["main_ingredients"] = list(dict.fromkeys(main))[:MAX_MAIN]
        edits.append(f"{stem}: picked_idea.main_ingredients added from the recipe ({len(idea['main_ingredients'])} foods)")

    doc = {"form": form, "picked_idea": idea, "recipe": recipe}
    for meal, field, before, after in WORD_EDITS:
        if meal != stem:
            continue
        if field == "steps":
            hits = [i for i, s in enumerate(recipe["steps"]) if before in s]
            if not hits:
                raise SystemExit(f"{stem}: edit not found in steps: {before!r}")
            for i in hits:
                recipe["steps"][i] = recipe["steps"][i].replace(before, after)
                edits.append(f"{stem}: step {i + 1}: {before!r} -> {after!r}")
        else:
            text = _get(doc, field)
            if before not in text:
                raise SystemExit(f"{stem}: edit not found in {field}: {before!r}")
            _set(doc, field, text.replace(before, after))
            edits.append(f"{stem}: {field}: {before!r} -> {after!r}")
    for meal, field, start, after in REWRITES:
        if meal != stem:
            continue
        text = _get(doc, field)
        if not text.startswith(start):
            raise SystemExit(f"{stem}: {field} does not start with {start!r}")
        _set(doc, field, after)
        edits.append(f"{stem}: {field}: rewritten ({len(text)} -> {len(after)} characters): {after!r}")
    if translations is None:
        translations = load_translations()
    entry = translations.get(slugify(old["title"]))
    if entry:
        translate(stem, doc, entry, edits)
    return doc


def banned_hits(value, path="meal"):
    if isinstance(value, dict):
        return [h for k, v in value.items() for h in banned_hits(v, f"{path}.{k}")]
    if isinstance(value, list):
        return [h for i, v in enumerate(value) for h in banned_hits(v, f"{path}[{i}]")]
    if isinstance(value, str):
        return [f"{path}: {m.group(0)!r}" for m in BANNED.finditer(value)]
    return []


def convert_photo(src, dest):
    width = int(re.search(r"pixelWidth: (\d+)",
                          subprocess.run(["sips", "-g", "pixelWidth", str(src)], check=True, capture_output=True,
                                         text=True).stdout).group(1))
    cmd = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(JPEG_QUALITY)]
    if width > MAX_WIDTH:
        cmd += ["--resampleWidth", str(MAX_WIDTH)]
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([*cmd, str(src), "--out", str(dest)], check=True, capture_output=True)
    return width


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", required=True, type=Path, help="folder with the personal app's saved meals")
    ap.add_argument("--keep-fixture", action="store_true", help="keep the hand-made fixture meal")
    args = ap.parse_args(argv)

    OUT_MEALS.mkdir(parents=True, exist_ok=True)
    edits, unresolved, written, slugs = [], [], [], set()
    translations, source_slugs = load_translations(), set()
    for stem in MEALS:
        saved = json.loads((args.source / f"{stem}.json").read_text(encoding="utf-8"))
        source_slugs.add(slugify(saved["recipe"]["title"]))
        doc = convert(stem, saved, edits, unresolved, translations)
        slug = slugify(doc["recipe"]["title"])
        if slug in slugs:
            raise SystemExit(f"two demo meals share the slug {slug}")
        slugs.add(slug)
        meal = evaluate(doc["form"], doc["picked_idea"], doc["recipe"])
        meal = {"date": saved["date"], **meal, "slug": slug, "demo": True, "photo": f"/demo/images/{slug}.jpg",
                "photo_ai_generated": True}
        errors = validate_output(meal, "meal.schema.json")
        hits = banned_hits(meal)
        if errors or hits:
            raise SystemExit(f"{stem}: " + "; ".join(errors + hits))
        photo = args.source / "images" / stem / "1.png"
        if not photo.exists():
            raise SystemExit(f"{stem}: no photo at images/{stem}/1.png")
        width = convert_photo(photo, OUT_IMAGES / f"{slug}.jpg")
        (OUT_MEALS / f"{slug}.json").write_text(json.dumps(meal, ensure_ascii=False, indent=1) + "\n",
                                                encoding="utf-8")
        per = meal["evaluation"]["macros"]["per_serving"]
        written.append(f"{slug}: {per['kcal']:.0f} kcal, {per['protein_g']:.1f} g protein, photo {width} px -> "
                       f"{min(width, MAX_WIDTH)} px, status {meal['evaluation']['status']}")

    unused = sorted(set(translations) - source_slugs)
    if unused:
        raise SystemExit(f"translations for no saved meal: {', '.join(unused)}")

    # Every page lists the demo meals, so the fixture can go once real demo meals exist
    if FIXTURE.exists() and written and not args.keep_fixture:
        FIXTURE.unlink()
        edits.append(f"removed {FIXTURE.relative_to(ROOT)}")
    # Files of an older build (a slug that changed) go too, so every photo path stays valid
    stale = [p for p in OUT_MEALS.glob("*.json") if p.stem not in slugs and p != FIXTURE]
    stale += [p for p in OUT_IMAGES.glob("*.jpg") if p.stem not in slugs]
    for path in sorted(stale):
        path.unlink()
        edits.append(f"removed old file {path.relative_to(ROOT)}")

    print(f"{len(written)} demo meals written to {OUT_MEALS.relative_to(ROOT)}")
    print("\n".join(f"  {w}" for w in written))
    print("unresolved names:", ", ".join(sorted(set(unresolved))) or "none")
    print("edits:")
    print("\n".join(f"  {e}" for e in edits))


if __name__ == "__main__":
    main()
