"""One name per food. canonical(name) gives the English key used in every data file, or None.

The keys and their other spellings live in data/open/aliases.json: "foods" lists the English keys of the AI prompt's
food list, "more_foods" the keys the engine also knows (name and nutrition, not in the prompt list), "aliases" and
"more_aliases" map Spanish names and other spellings to one key (only "aliases" feeds aliases_of, which the dish
picks for the Idea prompt use). Matching ignores case, accents, extra spaces and simple plurals
("Pechugas de pollo" -> "chicken breast", "egg" -> "eggs", "Champiñón" -> "mushrooms"). A name no alias matches can
still count as a food through "word_rules" ("pork chops" -> "pork loin"); match() says when that happened.
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ALIASES = Path(__file__).resolve().parents[1] / "data" / "open" / "aliases.json"
STOPWORDS = {"de", "del", "la", "el", "los", "las", "en", "al", "a", "con", "y", "o", "para", "sin", "un", "una",
             "lata", "the", "and", "or", "with", "of", "in", "for", "on", "an", "some", "no"}


def plain(text):
    """Lowercase, no accents, single spaces."""
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).split())


def singular(word):
    """Plural dropped: "huevos" -> "huevo", "eggs" -> "egg", "champinones" -> "champinon", "tomatoes" -> "tomato"."""
    if len(word) > 4 and word.endswith("es") and word[-3] in "nrld" and word[-4] in "aeiou":
        return word[:-2]  # Spanish plural of a word ending in a consonant (limones, coles)
    if len(word) > 4 and word.endswith("oes"):
        return word[:-2]
    return word[:-1] if len(word) > 3 and word.endswith("s") else word


def words(text):
    """Content words of a text, stopwords left out."""
    return [w for w in re.findall(r"[a-z0-9]+", plain(text)) if w not in STOPWORDS]


def stems(text):
    """Set of singular content words, for word-level matching (cravings, exclusions)."""
    return {singular(w) for w in words(text)}


def _form(text):
    return re.sub(r"\s+%", "%", plain(text))  # "0 %" and "0%" are the same name


def _singular_phrase(text):
    return " ".join(singular(w) for w in _form(text).split())


def _rules(data):
    """word_rules from aliases.json with every word in its singular form, as sets."""
    spec = data.get("word_rules") or {}
    sing = lambda ws: frozenset(singular(w) for w in ws)
    rules = tuple({"words": sing(r["words"]), "food": r["food"], "head": r.get("head"),
                   "unless": sing(r.get("unless", ()))} for r in spec.get("rules", ()))
    return (rules, frozenset(spec.get("split_words", ())), sing(spec.get("stop_words", ())),
            sing(spec.get("frozen_words", ())))


@lru_cache(maxsize=4)
def _load(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    foods = tuple(data["foods"])
    every = foods + tuple(data.get("more_foods", ()))
    aliases = {_form(k): v for k, v in {**data["aliases"], **data.get("more_aliases", {})}.items()}
    dish_aliases = {_form(k): v for k, v in data["aliases"].items()}
    exact, clashes = {}, set()
    for form, key in [(_form(f), f) for f in every] + list(aliases.items()):
        if exact.setdefault(form, key) != key:
            clashes.add(form)
    loose = {}
    for form, key in exact.items():
        loose.setdefault(_singular_phrase(form), set()).add(key)
    return foods, aliases, exact, loose, clashes, every, _rules(data), dish_aliases


def foods(path=ALIASES):
    """English food keys of the AI prompt's food list (KNOWN INGREDIENTS), sorted."""
    return sorted(_load(str(path))[0])


def all_foods(path=ALIASES):
    """Every English food key the engine knows: the prompt's food list and "more_foods", sorted."""
    return sorted(_load(str(path))[5])


def word_rules(path=ALIASES):
    """The word rules in order, each {"words", "food", "head", "unless"} with singular word sets."""
    return list(_load(str(path))[6][0])


def aliases(path=ALIASES):
    """{alias (plain): English key}."""
    return dict(_load(str(path))[1])


def aliases_of(key, path=ALIASES):
    """Other names of one English key from "aliases", sorted (not "more_aliases": the dish picks for the Idea prompt
    match cravings and exclusions through these, and stay the same until an eval run)."""
    return sorted(a for a, k in _load(str(path))[7].items() if k == key)


def pairs(path=ALIASES):
    """(alias, English key) for every alias, sorted."""
    return sorted(_load(str(path))[1].items())


def ambiguous(path=ALIASES):
    """Names that point to more than one key, exactly or once plurals are dropped. Empty for good data."""
    loose, clashes = _load(str(path))[3:5]
    return sorted(clashes | {form for form, keys in loose.items() if len(keys) > 1})


def _by_rule(form, spec):
    """Food of the first word rule that fits the name, or None (see "word_rules" in aliases.json). The name is read up
    to the first split word, so "sardinas en aceite" is about sardines, not oil; a rule's unless words count in the
    whole name ("frozen chicken in sauce" is not plain chicken). A rule with no food ("pork fat") stops the search: the
    name stays unknown."""
    rules, split, stop, frozen_words = spec
    tokens = re.findall(r"[a-z0-9]+", form)
    every = {singular(w) for w in tokens if w not in STOPWORDS}
    main = []
    for token in tokens:
        if token in split:
            break
        main.append(token)
    ws = [singular(w) for w in main if w not in STOPWORDS]
    if not ws:
        return None
    have, ends = set(ws), {ws[0], ws[-1]}
    frozen = bool(have & frozen_words)
    for rule in rules:
        need = rule["words"]
        if not need <= have or every & rule["unless"] or (ends & stop) - need:
            continue
        if rule["food"] is None:
            return None
        if frozen != ("frozen" in rule["food"]):
            continue  # a fresh name never counts as a frozen food, nor a frozen name as a fresh one
        if rule["head"] and ws[0 if rule["head"] == "first" else -1] not in need:
            continue
        return rule["food"]
    return None


def match(name, path=ALIASES):
    """(English key, by_rule) for a food name: by_rule is True when no name of the food matched and a word rule
    picked the closest food ("pork chops" -> ("pork loin", True)). (None, False) when the food is unknown."""
    data = _load(str(path))
    exact, loose = data[2], data[3]
    form = _form(name)
    if form in exact:
        return exact[form], False
    keys = loose.get(_singular_phrase(form))
    if keys and len(keys) == 1:
        return next(iter(keys)), False
    key = _by_rule(form, data[6])
    return key, key is not None


def canonical(name, path=ALIASES):
    """English key for a food name (any case, accents, simple plurals, word rules), or None when the food is unknown."""
    return match(name, path)[0]


def base_words(name):
    """Words of a food after names.canonical: the English key's words when the food is known, else its own words."""
    return stems(canonical(name) or name)


def missing_main_foods(idea, ingredients):
    """Main foods of the idea the recipe dropped (moved here from eval/checks.py on 2026-11-20 for the trial route).
    A food counts as kept when its first word is in an ingredient name, both names are the same food (same English
    key, so "pechuga de pollo" keeps "chicken breast"), or an ingredient is a specific kind of it: every base word of
    the main food is in the ingredient's base words, so "basmati rice" keeps "rice" and "arroz", "cherry tomatoes"
    keeps "tomato". Base words come after names.canonical."""
    have = set().union(*(stems(str(i.get("name") or "")) for i in ingredients)) if ingredients else set()
    keys = {canonical(str(i.get("name") or "")) for i in ingredients} - {None}
    bases = [base_words(str(i.get("name") or "")) for i in ingredients]
    return [f for f in idea.get("main_ingredients") or []
            if stems(f.split()[0] if f.split() else f) - have and canonical(f) not in keys
            and not any(base_words(f) <= b for b in bases)]
