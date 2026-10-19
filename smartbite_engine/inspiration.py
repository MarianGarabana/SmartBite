"""Real dishes for the Idea agent: 12 per request, craving matches first, the rest at random, none with an
excluded food. Seeded by the request, so the same request always gets the same pick.

The shuffle is a small seeded one (FNV-1a hash of the seed, mulberry32 numbers, Fisher-Yates) instead of Python's
random module, so web/lib/inspiration.js picks the same 12 dishes in the browser for the same seed.

Dish foods are English keys (data/open/aliases.json); Spanish cravings and exclusions match through the aliases."""
import json
from pathlib import Path

from .names import aliases_of, canonical, singular, stems

DISHES = Path(__file__).resolve().parents[1] / "data" / "open" / "inspiration" / "dishes.json"
COUNT = 12
FIELDS = ("name", "cuisine", "style", "core", "method")
stem = singular  # old name, kept for callers
MASK = 0xFFFFFFFF


def load_dishes(path=DISHES):
    return json.loads(Path(path).read_text(encoding="utf-8"))["dishes"]


def foods(dish):
    """Each main food of a dish as a list of its names: the English key first, then its aliases."""
    out = []
    for name in dish["core"]:
        key = canonical(name) or name
        out.append([key, *aliases_of(key)] + ([name] if name != key else []))
    return out


def has_food(dish, exclude):
    """True when one excluded food matches a main food: every word of the excluded item is in one name of that
    food (English key or an alias). "pollo" matches "chicken thigh" (alias "contramuslo de pollo"), "pepper"
    matches "red bell pepper"."""
    banned = [stems(e) for e in exclude if stems(e)]
    return any(b <= stems(name) for b in banned for names in foods(dish) for name in names)


def about(dish):
    return stems(" ".join([dish["name"], dish["cuisine"], dish["style"], *(n for names in foods(dish) for n in names)]))


def seed_number(seed):
    """32-bit FNV-1a hash of str(seed) in UTF-8."""
    h = 0x811C9DC5
    for byte in str(seed).encode("utf-8"):
        h = ((h ^ byte) * 0x01000193) & MASK
    return h


def numbers(seed):
    """Endless 32-bit numbers from the seed (mulberry32), the same as numbers() in web/lib/inspiration.js."""
    a = seed_number(seed)
    while True:
        a = (a + 0x6D2B79F5) & MASK
        t = ((a ^ (a >> 15)) * (a | 1)) & MASK
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & MASK)) & MASK) ^ t
        yield (t ^ (t >> 14)) & MASK


def shuffled(items, seed):
    """New list in a seeded order (Fisher-Yates, index = number mod (i + 1))."""
    out = list(items)
    draw = numbers(seed)
    for i in range(len(out) - 1, 0, -1):
        j = next(draw) % (i + 1)
        out[i], out[j] = out[j], out[i]
    return out


def pick_dishes(craving, exclude=(), *, seed, dishes=None, count=COUNT):
    dishes = load_dishes() if dishes is None else dishes
    wanted = stems(craving)
    allowed = shuffled([d for d in dishes if not has_food(d, exclude)], seed)
    allowed.sort(key=lambda d: -len(wanted & about(d)))  # stable sort: ties keep the shuffled order
    return [{k: d[k] for k in FIELDS} for d in allowed[:count]]
