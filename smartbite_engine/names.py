"""One name per food. canonical(name) gives the English key used in every data file, or None.

The keys and their other spellings live in data/open/aliases.json: "foods" lists every English key, "aliases"
maps Spanish names and other spellings to one key. Matching ignores case, accents, extra spaces and simple
plurals ("Pechugas de pollo" -> "chicken breast", "egg" -> "eggs", "Champiñón" -> "mushrooms").
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


@lru_cache(maxsize=4)
def _load(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    foods = tuple(data["foods"])
    aliases = {_form(k): v for k, v in data["aliases"].items()}
    exact, clashes = {}, set()
    for form, key in [(_form(f), f) for f in foods] + list(aliases.items()):
        if exact.setdefault(form, key) != key:
            clashes.add(form)
    loose = {}
    for form, key in exact.items():
        loose.setdefault(_singular_phrase(form), set()).add(key)
    return foods, aliases, exact, loose, clashes


def foods(path=ALIASES):
    """Every English food key, sorted."""
    return sorted(_load(str(path))[0])


def aliases(path=ALIASES):
    """{alias (plain): English key}."""
    return dict(_load(str(path))[1])


def aliases_of(key, path=ALIASES):
    """Other names of one English key, sorted."""
    return sorted(a for a, k in _load(str(path))[1].items() if k == key)


def pairs(path=ALIASES):
    """(alias, English key) for every alias, sorted."""
    return sorted(_load(str(path))[1].items())


def ambiguous(path=ALIASES):
    """Names that point to more than one key, exactly or once plurals are dropped. Empty for good data."""
    _, _, _, loose, clashes = _load(str(path))
    return sorted(clashes | {form for form, keys in loose.items() if len(keys) > 1})


def canonical(name, path=ALIASES):
    """English key for a food name (any case, accents, simple plurals), or None when the food is unknown."""
    _, _, exact, loose, _ = _load(str(path))
    form = _form(name)
    if form in exact:
        return exact[form]
    keys = loose.get(_singular_phrase(form))
    return next(iter(keys)) if keys and len(keys) == 1 else None
