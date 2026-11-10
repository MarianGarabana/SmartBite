"""Grams for foods counted in pieces ("4 large potatoes", "3 cloves garlic"), from data/open/piece-weights.json.

Recipe import (decided 2026-11-10): the model returns the count and the size word of a piece line; code looks up the
weight of one piece, so the weight comes from USDA data, not from the model. A food not in the table keeps the
model's grams. A size with no USDA row is scaled from medium (small 0.6, large 1.5, as the import prompt says).
"""
import json
import re
from functools import lru_cache
from pathlib import Path

TABLE = Path(__file__).resolve().parents[1] / "data" / "open" / "piece-weights.json"
SCALE = {"small": 0.6, "medium": 1.0, "large": 1.5}
# A line that counts pieces starts with a number ("4", "1/2", "½", "1-2"), after an optional bullet, and names no
# weight, volume or container: "1/2 cup carrot" or "1 can tuna" keep the model's grams (decided 2026-11-10).
COUNT_START = re.compile(r"^\s*(?:[-*•·]\s*)?(?:\d|[½¼¾⅓⅔⅛])")
NOT_PIECES = re.compile(
    r"\b(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|kilos?|ml|cl|l|litres?|liters?|oz|ounces?|lbs?|"
    r"pounds?|fl|cans?|tins?|jars?|bunch(?:es)?|slices?|pinch(?:es)?|handfuls?|dash(?:es)?|"
    r"tazas?|cucharadas?|cucharaditas?|gramos?|kilogramos?|litros?|mililitros?|latas?|botes?|tarros?|manojos?|"
    r"rodajas?|lonchas?|pizcas?|vasos?|puñados?|chorritos?)\b", re.I)


@lru_cache(maxsize=None)
def _table(path=str(TABLE)):
    foods = json.loads(Path(path).read_text(encoding="utf-8"))["foods"]
    by_name = {}
    for name, entry in foods.items():
        for n in (name, *entry.get("aliases", ())):
            by_name[n.lower()] = entry
    return by_name


def piece_grams(name, count, size="medium", path=TABLE):
    """Grams of count pieces of this food at this size, or None when the food is not in the table."""
    entry = _table(str(path)).get((name or "").strip().lower())
    if entry is None or size not in SCALE:
        return None
    grams = entry["grams"]
    one = grams[size] if size in grams else grams["medium"] * SCALE[size]
    return round(count * one, 1)


def counts_pieces(line):
    """True when an ingredient line counts whole pieces ("4 large potatoes", "* 1 tallo de porro")."""
    return bool(COUNT_START.match(line or "")) and not NOT_PIECES.search(line or "")


def apply_pieces(reply, path=TABLE):
    """A copy of an import reply where every ingredient with "pieces" of a food in the table, on a line that counts
    pieces, gets its grams from the table; those are marked "grams_from": "pieces". Other ingredients are unchanged."""
    out = {**reply, "ingredients": []}
    for ing in reply.get("ingredients", []):
        pieces = ing.get("pieces")
        on_piece_line = pieces and counts_pieces(ing.get("line"))
        grams = piece_grams(ing.get("name"), pieces["count"], pieces["size"], path) if on_piece_line else None
        out["ingredients"].append({**ing, "grams_total": grams, "grams_from": "pieces"} if grams else dict(ing))
    return out
