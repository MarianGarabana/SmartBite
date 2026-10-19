"""Typical pack sizes from Open Food Facts (products sold in Spain) -> data/open/packs/packs.json.

Run from the repo root:
  .venv/bin/python data/build/build_packs.py --download   # streams the OFF CSV dump once, saves data/raw/off/off-spain.jsonl
  .venv/bin/python data/build/build_packs.py              # build packs.json and coverage.md from the saved file
"""
import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "off" / "off-spain.jsonl"
OFF_CSV = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"


def export_date(raw=RAW):
    """Date of the OFF dump used, from the Last-Modified header saved at download."""
    from email.utils import parsedate_to_datetime
    meta = json.loads(raw.with_suffix(".meta.json").read_text())
    return parsedate_to_datetime(meta["last_modified"]).date().isoformat()


KEEP = ("code", "product_name", "generic_name", "categories_tags", "quantity", "product_quantity",
        "product_quantity_unit", "unique_scans_n")

NUM = r"(\d+(?:[.,]\d+)?)"
UNIT = r"(kg|kilos?|g|gr|grs|gramos|mg|l|litros?|ml|cl)"
QTY_RE = re.compile(NUM + r"\s*" + UNIT + r"\b")
MULTI_RE = re.compile(r"(\d+)\s*(?:x|\*|latas? de|botes? de|tarros? de|uds?\.? de|unidades de|packs? de)\s*" + NUM + r"\s*" + UNIT + r"\b")
MULTI_AFTER_RE = re.compile(NUM + r"\s*" + UNIT + r"\s*(?:x|\*)\s*(\d+)\b")
DRAINED_RE = re.compile(r"(escurrid[oa]|drained|egoutte|neto escurrido|p\.? ?esc)")
EGG_RE = re.compile(r"(\d+)\s*(?:x\s*)?(?:uds?|unidades|u|huevos|eggs|piezas)\b")
GRAMS = {"kg": 1000, "kilo": 1000, "kilos": 1000, "g": 1, "gr": 1, "grs": 1, "gramos": 1, "mg": 0.001,
         "l": 1000, "litro": 1000, "litros": 1000, "ml": 1, "cl": 10}
LIQUID = {"l", "litro", "litros", "ml", "cl"}


def plain(text):
    """Lower case, no accents, so Spanish names match with or without them."""
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return text.lower()


def _num(text, unit="g"):
    # "1.000 g" is a thousand in Spanish labels; "1.5", "1,5" and "0.464 kg" are decimals
    if unit in ("g", "gr", "grs", "gramos", "ml") and re.fullmatch(r"[1-9]\d{0,2}\.\d{3}", text):
        return float(text.replace(".", ""))
    return float(text.replace(",", "."))


def _amount(text, density):
    """Grams of the first quantity in text, multipacks multiplied out; None if none found."""
    m = MULTI_RE.search(text)
    if m:
        return int(m.group(1)) * _num(m.group(2), m.group(3)) * GRAMS[m.group(3)] * (density if m.group(3) in LIQUID else 1)
    m = MULTI_AFTER_RE.search(text)
    if m:
        return int(m.group(3)) * _num(m.group(1), m.group(2)) * GRAMS[m.group(2)] * (density if m.group(2) in LIQUID else 1)
    m = QTY_RE.search(text)
    if m:
        return _num(m.group(1), m.group(2)) * GRAMS[m.group(2)] * (density if m.group(2) in LIQUID else 1)
    return None


def parse_quantity(quantity, product_quantity=None, unit=None, density=1.0, drained=False):
    """Pack grams from the OFF quantity text ("3 x 80 g", "1 kg", "500 ml"), else from product_quantity.

    drained: for cans and jars, use the drained weight when the label gives one.
    """
    text = plain(quantity)
    grams = None
    if drained:
        m = DRAINED_RE.search(text)
        if m:
            # The drained amount sits right after the word ("escurrido: 240 g") or right before it ("240 g escurrido")
            rest = text[m.end():m.end() + 25]
            after = _amount(rest, density) if re.match(r"[\s:.=-]*(?:de\s*)?\d", rest) else None
            before = QTY_RE.findall(text[:m.start()])
            if after:
                grams = after
            elif before:
                mult = MULTI_RE.findall(text[:m.start()])
                last = before[-1]
                grams = _num(last[0], last[1]) * GRAMS[last[1]]
                # "3 x 80 g (3 x 56 g escurrido)": the drained figure is per can too
                if len(mult) > 1 or (mult and len(before) == 1):
                    grams *= int(mult[-1][0])
    if grams is None:
        grams = _amount(text, density)
    if grams is None and product_quantity not in (None, ""):
        try:
            value = float(product_quantity)
        except ValueError:
            value = None
        if value:
            grams = value * (density if plain(unit) == "ml" else 1)
    if not grams or grams < 1 or grams > 25000:
        return None
    return round(grams)


def parse_units(quantity):
    """Egg count from the quantity text ("12 huevos", "6 uds", "docena")."""
    text = plain(quantity)
    if "media docena" in text:
        return 6
    m = EGG_RE.search(text)
    if m:
        return int(m.group(1))
    if "docena" in text or "dozen" in text:
        return 12
    m = re.fullmatch(r"\s*(\d+)\s*", text)
    return int(m.group(1)) if m else None

# Shared exclusions (accent free, lower case)
FLAV = (r"fresa|limon|miel|coco|fruta|stracciatella|mango|vainilla|cereal|chocolate|melocoton|frambuesa|arandano|nuec"
        r"|platano|higo|pistacho|caramelo|tarta|helado|kiwi|pina|frutos|galleta|avellana|cafe|bebible|bebida|cereza"
        r"|maracuya|manzana|pera\b|albaricoque|muesli|granola|azucarad|sabor|frozen|mora\b|turron|canela|natillas"
        r"|capuc+ino|citrico|edulcorad")
PREP = (r"ensalada|pizza|empanad|croqueta|lasan|sandwich|bocadillo|plato|preparad|cocinad|wrap|burrito|hamburg"
        r"|burger|nugget|rebozad|snack|sopa|crema de|pate\b|untable|tarta|quiche|rellen|con salsa|al curry|guiso"
        r"|potaje|menu|salchich|albondig|canelon|tortilla|hojaldre|pastel|gratinad")
FRESH_NOT = r"congelad|frozen|lata|conserva|en aceite|escabeche|ahumad|seco|deshidratad|zumo|mermelada|confitur|almibar"
FROZEN = ["en:frozen-foods"]
CANNED_LEG = ["en:canned-chickpeas", "en:canned-legumes", "en:canned-common-beans", "en:canned-white-common-beans",
              "en:cooked-lentils", "en:canned-lentils", "en:cooked-chickpeas", "en:canned-vegetables"]
COOKED = r"cocid|bote|frasco|tarro|lata|conserva|al natural|extra cocid"

# food: sold_by, name regex, OFF categories (any one, or None), exclude regex, options.
# Per kg foods are not looked up in OFF: loose fresh produce is bought by the piece, bunch or head (PIECES below,
# or an override), at a price per kg.
# drained: cans and jars use the drained weight when the label gives it. density: grams per ml for liquids.
FOODS = {
    # Protein
    "feta": ("pack", r"\bfeta\b", ["en:cheeses"], PREP + r"|espinaca|aceituna|tomate|salsa|hummus|cracker", {}),
    "chicken breast": ("pack", r"pechuga.*pollo|pollo.*pechuga|chicken breast", ["en:chicken-breasts", "en:chickens"],
                         PREP + r"|fiambre|loncha|cocid|asad|ahumad|finas|kebab|plancha|horno|tacos|curry|caldo|pavo|fritas|lonchea", {}),
    "chicken thigh": ("pack", r"contramuslo", None, PREP + r"|asad|cocid|pavo|adobad", {}),
    "ground chicken": ("pack", r"pollo picad|picad[oa] de pollo|carne picada de pollo", None, PREP, {}),
    "ground turkey": ("pack", r"pavo picad|picad[oa] de pavo|carne picada de pavo", None, PREP, {}),
    "turkey tenderloin": ("pack", r"solomillos? de pavo", None, PREP + r"|asad|cocid|loncha|fiambre", {}),
    "ground beef": ("pack", r"picad[ao].*(ternera|vacuno|anojo|vaca)|(ternera|vacuno|anojo|vaca).*picad",
                       None, PREP + r"|cerdo|mixta|pollo|pavo|cebolla", {}),
    "beef steak": ("pack", r"filetes? (de )?(ternera|anojo|vacuno|vaca)|(ternera|anojo|vacuno).*filete",
                          None, PREP + r"|picad|cocid|fiambre|loncha", {}),
    "pork loin": ("pack", r"lomo.*cerdo|cinta de lomo|lomo fresco", None,
                      PREP + r"|embuchad|curad|loncha|lonchead|cocid|iberico|caña|sobrasada|tostas|chips|al ajillo en|bellota|fiambre", {}),
    "salmon": ("pack", r"salmon", ["en:salmons", "en:fishes"],
               PREP + r"|" + FRESH_NOT + r"|smoked|affumicato|dip|spread|al natural|barbacoa|sensation|sushi|tartar|carpaccio|marinad|gravlax|huevas|caviar|pasta|wild|pink|keta", {}),
    "frozen salmon": ("pack", r"salmon", FROZEN, PREP + r"|ahumad|sushi", {}),
    "fresh tuna": ("pack", r"atun fresco|lomo de atun fresco|tataki de atun|atun tataki", None, r"lata|aceite|conserva|ensalada", {}),
    "frozen hake": ("pack", r"merluza", FROZEN, PREP + r"|varita|empanad|surimi|palito|salsa", {}),
    "frozen shrimp": ("pack", r"gamba|langostino|camaron|shrimp|prawn", FROZEN, PREP + r"|surimi|al ajillo|cola de|paella", {}),
    "canned tuna in water": ("pack", r"atun.*natural|natural.*atun|tuna in water", ["en:canned-tunas"],
                                   r"aceite|oliva|ensalada|pate|escabeche|tomate|fresco|congelad|pimienta|limon", {"drained": True}),
    "canned tuna in oil": ("pack", r"atun claro|atun", ["en:canned-tunas"],
                           r"ensalada|pate|fresco|congelad|ventresca|escabeche|tomate|pimienta|limon|picante", {"drained": True}),
    "canned sardines": ("pack", r"sardin", ["en:canned-sardines", "en:canned-fishes"], r"fresc|congelad|pate|untable", {"drained": True}),
    "canned mackerel": ("pack", r"caballa|mackerel", ["en:tinned-mackerels", "en:mackerels", "en:canned-fishes"],
                        r"fresc|congelad|pate|untable|ahumad", {"drained": True}),
    "eggs": ("per_unit", r"huevo|eggs?\b", ["en:eggs"],
               r"codorniz|chocolate|pascua|cocid|liquid|clara|tortilla|pasta|fideo|mayonesa|kinder|duro|sorpresa|yema|hilado|polvo|pato|oca|avestruz", {}),
    "egg whites": ("pack", r"claras?( de huevo)?\b|egg white", ["en:eggs", "en:egg-white"], r"yema|polvo|uva|pasas", {"density": 1.0}),
    "greek yogurt 0%": ("pack", r"griego.*(0 ?%|desnatad|light|0,0|cero)|(0 ?%|desnatad|light).*griego", None,
                        FLAV + r"|azucar", {"density": 1.0}),
    "greek yogurt": ("pack", r"griego", ["en:greek-style-yogurts", "en:yogurts"],
                             FLAV + r"|0 ?%|desnatad|light|azucar|cero|proteina", {"density": 1.0}),
    "plain yogurt 0%": ("pack", r"yogur.*natural.*(desnatad|0 ?%|0,0)|yogur.*(desnatad|0 ?%).*natural|yogur desnatado$",
                                None, FLAV + r"|griego|azucar|edulcor|bifidus|soja", {"density": 1.0}),
    "skyr": ("pack", r"skyr", None, FLAV + r"|frozen|helado", {"density": 1.0}),
    "quark 0%": ("pack", r"queso fresco batido|quark|fromage frais", None, FLAV, {"density": 1.0}),
    "cottage cheese": ("pack", r"cottage", ["en:cheeses", "en:dairies"], FLAV + r"|pina", {}),
    "ricotta": ("pack", r"requeson|ricotta", ["en:cheeses", "en:dairies"], PREP + r"|pasta|ravioli|tortellini|espinaca", {}),
    "light fresh cheese": ("pack", r"burgos", ["en:cheeses", "en:fresh-cheeses", "en:dairies"],
                                  PREP + r"|morcilla|chorizo|embutido", {}),
    "firm tofu": ("pack", r"tofu", ["en:tofu", "en:meat-alternatives", "en:legumes-and-their-products"],
                   PREP + r"|bebida|postre|mayonesa|sedoso|silken|untable|fritos?\b", {}),
    "sliced turkey breast": ("pack", r"pechuga de pavo|pavo", ["en:cooked-turkey-breast-slices", "en:turkey-breasts", "en:turkeys"],
                                PREP + r"|picad|filete|solomillo|contramuslo|muslo|crudo|fresc", {}),
    "mozzarella": ("pack", r"mozzarella", ["en:mozzarella", "en:cheeses"],
                   PREP + r"|light|ligera|rallad|stick|palito|tomate|pesto|bocconcini|perla", {}),
    "light mozzarella": ("pack", r"mozzarella.*(light|ligera|0 ?%|reducid|semi)|(light|ligera).*mozzarella",
                         ["en:mozzarella", "en:cheeses"], PREP + r"|rallad|stick|palito", {}),
    "vanilla whey protein": ("pack", r"whey|suero de leche.*protein|proteina de suero", ["en:protein-powders", "en:dietary-supplements"],
                               r"barrita|bar\b|batido listo|bebida|rtd|galleta|crema|pancake|tortita", {}),

    # Legumes
    "canned chickpeas": ("pack", r"garbanzo", CANNED_LEG,
                          PREP + r"|hummus|humus|harina|pasta|crujient|tostad|espinac|seco|frito|snack|chorizo", {"drained": True, "or_name": COOKED}),
    "dried chickpeas": ("pack", r"garbanzo", ["en:chickpeas", "en:dried-chickpeas", "en:dried-legumes"],
                        PREP + r"|hummus|humus|harina|pasta|crujient|tostad|snack|" + COOKED, {"not_cats": CANNED_LEG}),
    "canned lentils": ("pack", r"lenteja", CANNED_LEG,
                         PREP + r"|harina|pasta|crujient|snack|chorizo|seca|verdura", {"drained": True, "or_name": COOKED}),
    "dried lentils": ("pack", r"lenteja", ["en:lentils", "en:dried-lentils", "en:dried-legumes"],
                       PREP + r"|harina|pasta|crujient|snack|chorizo|" + COOKED, {"not_cats": CANNED_LEG}),
    "canned white beans": ("pack", r"(alubia|judia|frijol|haba).*blanc|white bean", CANNED_LEG,
                                PREP + r"|harina|seca|chorizo|tomate", {"drained": True, "or_name": COOKED}),
    "canned red kidney beans": ("pack", r"(alubia|judia|frijol).*roj|kidney", CANNED_LEG,
                              PREP + r"|harina|seca|chorizo|tomate|chili", {"drained": True, "or_name": COOKED}),
    "frozen edamame": ("pack", r"edamame", None, PREP + r"|tostad|snack|crujient|pasta", {}),
    "textured soy protein": ("pack", r"soja texturizada|proteina de soja texturizada|texturizad", None, PREP, {}),
    "hummus": ("pack", r"hummus|humus", ["en:hummus", "en:spreads"], r"tosta|pretzel|chocolate|snack|cracker|tortilla|chips|pack con", {}),

    # Carbs (rice, pasta, quinoa, couscous in dry grams)
    "rice": ("pack", r"arroz", ["en:rices", "en:long-grain-rices"],
              PREP + r"|integral|basmati|jazmin|vasito|microondas|cocid|bebida|tortita|harina|leche|risotto|salvaje|sushi|delicias|hinchad|galleta|fideo|noodle|thai|paella|vinagre|rojo|negro|salvaje|largo vaporizado integral", {}),
    "brown rice": ("pack", r"arroz.*integral|integral.*arroz|brown rice", ["en:rices", "en:brown-rices"],
                       PREP + r"|vasito|microondas|cocid|bebida|tortita|harina|galleta|hinchad|noodle|fideo|basmati", {}),
    "basmati rice": ("pack", r"basmati", ["en:rices", "en:basmati-rices"],
                      PREP + r"|integral|vasito|microondas|cocid|listo|express|minuto", {}),
    "microwave rice": ("pack", r"arroz.*(vasito|microondas|minuto|express|listo|cocido)|(vasito|microondas).*arroz",
                                    ["en:rices", "en:cereals-and-potatoes"], PREP + r"|integral|leche|tortita", {}),
    "wholemeal pasta": ("pack", r"integral", ["en:pastas", "en:dry-pastas"],
                       PREP + r"|fresca|rellen|ravioli|tortellini|lasan|sopa|gluten|lenteja|garbanzo|guisante", {}),
    "macaroni": ("pack", r"macarron|maccheroni|macaroni", ["en:pastas", "en:dry-pastas", "en:durum-wheat-macaroni"],
                   PREP + r"|integral|queso|bolonesa|carbonara|gluten|lenteja|garbanzo|fresca", {}),
    "couscous": ("pack", r"cuscus|couscous|cous cous", None, PREP + r"|integral|verdura|perla", {}),
    "quinoa": ("pack", r"quinoa|quinua", ["en:quinoa", "en:seeds", "en:cereals-and-potatoes"],
               PREP + r"|cocid|vasito|microondas|copos|harina|hinchad|tortita|barrita|galleta|bebida|pasta|lista|express|chips", {}),
    "cooked quinoa": ("pack", r"quinoa.*(cocid|vasito|microondas|lista|listo|express|minuto)|(vasito|microondas).*quinoa", None,
                      r"pizza|ensalada|tortita|barrita|galleta", {}),
    "rolled oats": ("pack", r"avena", ["en:rolled-oats", "en:oat"],
                       r"bebida|galleta|barrita|harina|salvado|muesli|granola|chocolate|porridge|crema|instant|cookie", {}),
    "wholemeal sandwich bread": ("pack", r"molde.*integral|integral.*molde|pan integral", ["en:sliced-breads", "en:wholemeal-sliced-breads"],
                              r"sin corteza|tostad|sin gluten|brioche|hamburguesa|perrito", {}),
    "wheat tortillas": ("pack", r"tortilla.*trigo|trigo.*tortilla|wrap|fajita|burrito", ["en:flatbreads", "en:wheat-flatbreads", "en:wraps", "es:tortillas", "en:breads"],
                           r"patata|maiz|chips|nacho|relleno|kit|salsa|pollo|atun", {}),
    "gnocchi": ("pack", r"noqui|gnocchi", None, PREP + r"|salsa", {}),
    "pita bread": ("pack", r"\bpita\b", ["en:pitas", "en:flatbreads", "en:breads"], r"chips|rellen|kebab", {}),
    "potato": ("per_kg", None, None, None, {}),
    "sweet potato": ("per_kg", None, None, None, {}),

    # Vegetables, frozen and shelf stable
    "frozen broccoli": ("pack", r"brocoli|brecol|broccoli", FROZEN, PREP + r"|mezcla|con\b", {}),
    "frozen spinach": ("pack", r"espinaca", FROZEN + ["en:frozen-spinachs"], PREP + r"|crema|bechamel|mezcla", {}),
    "frozen green beans": ("pack", r"judias? verdes?|green beans", FROZEN + ["en:frozen-green-beans"], PREP + r"|mezcla|patata", {}),
    "frozen peas": ("pack", r"guisante", FROZEN, PREP + r"|mezcla|zanahoria|jamon|harina", {}),
    "frozen cauliflower": ("pack", r"coliflor", FROZEN, PREP + r"|mezcla|arroz de|bechamel|gratin", {}),
    "frozen mixed berries": ("pack", r"frutos rojos|frutas del bosque|berries|frutos del bosque", FROZEN + ["en:frozen-berries", "en:frozen-fruits"],
                                r"helado|tarta|yogur|smoothie bar|sorbete|bizcocho|muffin", {}),
    "frozen stir-fry vegetables": ("pack", r"salte|wok|verduras? (para|al) ", FROZEN, r"pollo|gamba|arroz|pasta|carne|fideo|noodle", {}),
    "roasted red peppers": ("pack", r"pimientos? (rojos? )?asados?|asados?.*pimiento", None, PREP + r"|aceituna|anchoa", {"drained": True}),
    "crushed tomatoes": ("pack", r"tomate triturado|triturado de tomate|crushed tomato", None, r"frito|salsa|albahaca|cebolla", {}),
    "tomato sauce": ("pack", r"tomate frito", None, r"pizza|pasta|atun|sardina|caballa|albondig", {}),
    "canned sliced mushrooms": ("pack", r"champinon.*(laminad|lata|frasco|conserva|cortad)|(laminad).*champinon",
                                ["en:canned-mushrooms", "en:canned-vegetables", "en:mushrooms"], PREP + r"|congelad|fresco|ajillo", {"drained": True}),
    "artichoke hearts": ("pack", r"alcachofa", ["en:artichoke-hearts", "en:canned-vegetables", "en:artichokes"],
                               PREP + r"|congelad|fresc|crema|pate|aceite", {"drained": True}),
    "canned sweetcorn": ("pack", r"maiz", ["en:canned-sweet-corn", "en:canned-corn"], PREP + r"|palomita|harina|tortita|copo|chip|congelad|mazorca|tostad", {"drained": True}),
    "kalamata olives": ("pack", r"kalamata", None, r"pate|crema|tapenade|aceite de", {"drained": True}),
    "cucumber": ("per_kg", None, None, None, {}),
    "red bell pepper": ("per_kg", None, None, None, {}),
    "green bell pepper": ("per_kg", None, None, None, {}),
    "tomato": ("per_kg", None, None, None, {}),
    "broccoli": ("per_kg", None, None, None, {}),
    "pumpkin": ("per_kg", None, None, None, {}),
    "zucchini": ("per_kg", None, None, None, {}),
    "onion": ("per_kg", None, None, None, {}),
    "carrot": ("per_kg", None, None, None, {}),
    "green beans": ("per_kg", None, None, None, {}),
    "eggplant": ("per_kg", None, None, None, {}),
    "cauliflower": ("per_kg", None, None, None, {}),
    "brussels sprouts": ("per_kg", None, None, None, {}),
    "avocado": ("per_kg", None, None, None, {}),
    "lemon": ("per_kg", None, None, None, {}),
    "lime": ("per_kg", None, None, None, {}),
    # Fresh items usually sold in a bag, tray or bunch
    "cherry tomatoes": ("pack", r"cherry|cherri", ["en:cherry-tomatoes", "en:tomatoes", "en:fresh-tomatoes"], FRESH_NOT + r"|salsa|frito|pizza|pera|kumato", {}),
    "spinach": ("pack", r"espinaca", ["en:spinachs", "en:leaf-vegetables", "en:salads"], PREP + r"|" + FRESH_NOT + r"|bechamel|crema|tortellini|ravioli|pasta|mezcla", {}),
    "arugula": ("pack", r"rucula|rucola|arugula|rocket", None, PREP + r"|" + FRESH_NOT + r"|mezcla|pesto|queso|pasta", {}),
    "kale": ("pack", r"\bkale\b|col rizada", None, PREP + r"|" + FRESH_NOT + r"|chips|mezcla|zumo|pesto", {}),
    "lettuce": ("per_kg", None, None, None, {}),  # bought by the head
    "fresh parsley": ("pack", r"^(eco |bio )?perejil\b", None, FRESH_NOT + r"|seco|deshidratad|liofilizad|ajo|congel|molid|copos", {}),
    "spring onion": ("per_kg", None, None, None, {}),
    "mushrooms": ("pack", r"champinon|mushroom", ["en:mushrooms", "en:fresh-vegetables"], PREP + r"|" + FRESH_NOT + r"|laminado en|frasco|ajillo|crema", {}),
    "garlic": ("pack", r"\bajos?\b|garlic", ["en:garlic", "en:fresh-vegetables"], r"polvo|granulad|molido|seco|deshidratad|negro|frito|pasta|crema|salsa|aceite|mayonesa|alioli|perejil|pan de|crujiente|ajillo", {}),

    # Fruit
    "blueberries": ("pack", r"arandano|blueberr", ["en:blueberries", "en:berries", "en:fresh-fruits"], FRESH_NOT + r"|rojo|cranberr|yogur|zumo|bebida|barrita|galleta|muffin|chocolate", {}),
    "raspberries": ("pack", r"frambuesa|raspberr", ["en:raspberries", "en:berries", "en:fresh-fruits"], FRESH_NOT + r"|yogur|bebida|galleta|chocolate", {}),
    "strawberries": ("pack", r"fresa|freson|strawberr", ["en:strawberries", "en:berries", "en:fresh-fruits"], FRESH_NOT + r"|yogur|bebida|galleta|chocolate|batido|gominola|nata", {}),
    "pomegranate": ("per_kg", None, None, None, {}),
    "banana": ("per_kg", None, None, None, {}),
    "apple": ("per_kg", None, None, None, {}),
    "orange": ("per_kg", None, None, None, {}),
    "kiwi": ("per_kg", None, None, None, {}),

    # Dairy and drinks
    "semi-skimmed milk": ("pack", r"semidesnatada|semi desnatada|semi-desnatada", ["en:milks", "en:semi-skimmed-milks", "en:cow-milks"],
                            FLAV + r"|polvo|condensada|evaporada|lactosa", {"density": 1.03}),
    "kefir": ("pack", r"kefir", None, FLAV + r"|agua", {"density": 1.0}),
    "soy milk": ("pack", r"soja|soy", ["en:soy-based-drinks", "en:plant-based-milk-alternatives"],
                       FLAV + r"|yogur|postre|calcio y|zumo", {"density": 1.0}),
    "grated cheese": ("pack", r"rallad|grated", ["en:grated-cheese", "en:cheeses"], r"pan rallado|coco|zanahoria|tomate|naranja|limon", {}),
    "grana padano": ("pack", r"grana padano", ["en:grana-padano", "en:cheeses"], PREP + r"|rallad", {}),
    "light cream cheese": ("pack", r"(queso (crema|para untar|untar|de untar)|philadelphia|cream cheese).*(light|0 ?%|ligero|desnatad|lite|reducid)|(light|ligero).*(queso crema|untar)",
                          ["en:cream-cheeses", "en:cheeses", "en:spreads", "en:dairies"], r"salmon|finas hierbas|cebolla|ajo|galleta|tarta|pepinillo", {}),
    "peanut butter": ("pack", r"crema de cacahuete|mantequilla de cacahuete|peanut butter|cacahuete.*crema", ["en:peanut-butters", "en:spreads", "en:oilseed-purees", "en:nut-butters"],
                           r"chocolate|cacao|galleta|barrita|snack|bombon|pretzel|helado|polvo|mermelada", {}),
    "walnuts": ("pack", r"\bnuez\b|\bnueces\b|walnut", ["en:walnuts", "en:nuts", "en:shelled-walnuts"], r"moscada|macadamia|brasil|pecana|india|cajou|anacardo|mezcla|coco|chocolate|pan|helado|yogur|cascara|miel|galleta", {}),
    "sesame seeds": ("pack", r"sesamo", ["en:sesame-seeds", "en:seeds"], r"aceite|tahin|crema|pan|galleta|barrita|snack|tostas|crackers|negro y", {}),
    "chia seeds": ("pack", r"\bchia\b", ["en:chia-seeds", "en:seeds"], r"pan|galleta|barrita|snack|bebida|yogur|pudin|mermelada|tostas|crackers|mezcla", {}),

    # Pantry (optional lines in the cart)
    "extra virgin olive oil": ("pack", r"aceite.*oliva.*virgen extra|virgen extra|aove", ["en:extra-virgin-olive-oils", "en:olive-oils"],
                                     r"spray|aerosol|atun|sardina|caballa|aceituna|patata|chips|galleta|pan\b|bonito|mejillon|anchoa", {"density": 0.92}),
    "paprika": ("pack", r"pimenton|paprika", ["en:paprika", "en:spices", "en:condiments"], r"ahumad|vera|chorizo|patata|chips|lomo|aceite|salsa|pulpo", {}),
    "smoked paprika": ("pack", r"pimenton|paprika", ["en:paprika", "en:spices", "en:condiments", "en:smoked-paprika"], r"chorizo|patata|chips|lomo|aceite|salsa|dulce de la vera y", {"name_also": r"ahumad|vera|smoked"}),
    "cumin": ("pack", r"comino|cumin", ["en:cumin", "en:spices", "en:condiments"], r"queso|pan|galleta|aceite|salsa|mezcla", {}),
    "curry powder": ("pack", r"curry", ["en:curry-powder", "en:spices", "en:condiments"], r"pasta|paste|block|bloque|mix|korma|tuno|hummus|golden|roux|rojo|verde|amarillo|salsa|pasta|ketchup|pollo|arroz|lenteja|mayonesa|leche de coco|preparad|plato|garbanzo|sopa|crema", {}),
    "oregano": ("pack", r"oregano", ["en:oregano", "en:herbs", "en:spices", "en:condiments"], r"pizza|aceite|salsa|tomate|patata|chips|queso|aceituna|mezcla", {}),
    "garlic powder": ("pack", r"ajo.*(polvo|granulad|molido|deshidratad)|garlic powder", None, r"perejil|cebolla y|sal de|pan|mezcla|mayonesa|salsa", {}),
    "onion powder": ("pack", r"cebolla.*(polvo|granulad|molid|deshidratad)|onion powder", None, r"ajo y|sal de|mezcla|sopa|crema|salsa", {}),
    "black pepper": ("pack", r"pimienta negra|black pepper", ["en:black-peppers", "en:peppercorns", "en:black-peppercorns", "en:ground-peppers", "en:spices", "en:condiments"],
                       r"salsa|patata|chips|aceite|queso|salami|lomo|sal y|mezcla|crackers|anacardo|pistacho|almendra|frutos secos|tortita", {}),
    "salt": ("pack", r"^sal\b|\bsal (marina|fina|gruesa|yodada|de mesa|en escamas|del himalaya|rosa|maldon)|sea salt|^salt\b", ["en:salts", "en:condiments"],
            r"salsa|salmon|salchich|pimienta|ajo|hierbas|anchoa|chips|patata|bacalao|almendra|cacahuete|caramelo|chocolate|pipas|regaliz|galleta", {}),
    "sugar": ("pack", r"azucar|sugar", ["en:sugars", "en:white-sugars", "en:sweeteners"], r"sin azucar|0 ?% azucar|glas|caramelo|chocolate|galleta|edulcorante|sacarina|stevia|vainillin|refresco|bebida|zumo|chicle|caramelos|sirope|miel|mermelada|cereal|pan|bizcocho|algodon|perlas", {}),
    "cinnamon": ("pack", r"canela|cinnamon", ["en:cinnamon", "en:spices", "en:condiments"], r"galleta|cereal|bollo|rollo|yogur|arroz con leche|te\b|infusion|chicle|manzana|bebida|azucar|barrita|tostad|pan\b|natillas|mezcla|caramelo", {}),
    "nutmeg": ("pack", r"nuez moscada|nutmeg", None, r"mezcla", {}),
    "ground ginger": ("pack", r"jengibre.*(polvo|molid)|ginger powder|ground ginger", None, r"galleta|infusion|te\b|bebida|mezcla|curcuma y|limon|caramelo", {}),
    "thyme": ("pack", r"tomillo|thyme", None, r"miel|aceite|aceituna|queso|salsa|infusion|te\b|mezcla|patata|chips|limon", {}),
    "dried parsley": ("pack", r"perejil", None, r"fresco|ajo y|congelad|aceite|salsa|mezcla|patata|chips", {"name_also": r"seco|deshidratad|hojas|picado|molido|copos"}),
    "chili flakes": ("pack", r"guindilla|chile|chili|cayena|pimienta roja", None, r"salsa|aceite|encurtid|vinagre|en lata|bote|chocolate|patata|chips|con carne|mezcla|frijol|pasta|tomate|anchoa|aceituna|mayonesa|piparra", {"name_also": r"copos|escamas|triturad|molid|polvo|picad|seca"}),
    "mustard": ("pack", r"mostaza|mustard", ["en:mustards", "en:condiments", "en:sauces"], r"miel y|salsa de|semillas|patata|chips|pretzel|aceite|vinagreta|mayonesa", {}),
    "teriyaki sauce": ("pack", r"teriyaki", None, r"pollo|carne|salmon|arroz|fideo|noodle|preparad|plato|chips", {"density": 1.0}),
    "soy sauce": ("pack", r"salsa de soja|soy sauce|soja salsa|shoyu|tamari", ["en:soy-sauces", "en:sauces", "en:condiments"], r"pollo|arroz|fideo|noodle|preparad|plato|chips|pipas", {"density": 1.0}),
    "chicken broth": ("pack", r"caldo.*(pollo|gallina|ave)|(pollo|gallina|ave).*caldo|chicken broth|chicken stock", ["en:broths", "en:liquid-broths", "en:liquid-chicken-broths", "en:poultry-broth"],
                       r"pastilla|cubito|cubo|concentrad|polvo|deshidratad|sopa con|fideo|arroz|tetrabrick de pescado|pastillas|granulad|ramen", {"density": 1.0}),
    "vinegar": ("pack", r"vinagre|vinegar", ["en:vinegars", "en:condiments"], r"chips|patata|encurtid|aceituna|pepinillo|boqueron|anchoa|cebollita|guindilla|piparra|crema de|reduccion|glaseado", {"density": 1.0}),
    "lemon juice": ("pack", r"zumo de limon|lemon juice|jugo de limon", None, r"mayonesa|atun|tinto|vino|cerveza|burbujas|miel|refresco|bebida|limonada|soda|te\b|agua|naranja|jengibre|azucar|mezcla", {"density": 1.0}),
    "lime juice": ("pack", r"zumo de lima|lime juice|jugo de lima", None, r"refresco|bebida|soda|agua|limonada|mezcla|cordial", {"density": 1.0}),
}


def download(out=RAW, url=OFF_CSV):
    """Stream the official CSV dump once and keep only products sold in Spain (the full file is never saved)."""
    import gzip
    import urllib.request
    out.parent.mkdir(parents=True, exist_ok=True)
    # Third parties get the app name only
    req = urllib.request.Request(url, headers={"User-Agent": "SmartBite"})
    kept = total = bad = 0
    with urllib.request.urlopen(req) as resp, gzip.open(resp, "rt", encoding="utf-8", errors="replace") as lines, \
            open(out, "w", encoding="utf-8") as f:
        # Tab separated, one product per line, no quoting
        header = next(lines).rstrip("\n").split("\t")
        cols = {name: header.index(name) for name in KEEP + ("countries_tags",) if name in header}
        for line in lines:
            total += 1
            row = line.rstrip("\n").split("\t")
            if len(row) != len(header):
                bad += 1
                continue
            if "en:spain" not in row[cols["countries_tags"]].split(","):
                continue
            f.write(json.dumps({k: row[i] for k, i in cols.items() if k != "countries_tags"}, ensure_ascii=False) + "\n")
            kept += 1
    meta = {"source": url, "last_modified": resp.headers.get("Last-Modified"), "rows_read": total, "rows_kept": kept, "rows_bad": bad,
            "bytes": int(resp.headers.get("Content-Length") or 0)}
    out.with_suffix(".meta.json").write_text(json.dumps(meta, indent=1))
    print(meta)


OUT = ROOT / "data" / "open" / "packs"
OVERRIDES = Path(__file__).with_name("packs-overrides.json")
MIN_PRODUCTS = 5  # fewer parsed products than this: OFF is too thin, use an override or list the food as missing
MIN_SHARE = 0.08
MAX_SIZES = 3
EGG_GRAMS_M = 51

# Loose produce is bought by the piece, bunch or head: the unit is one USDA FoodData Central portion (CC0), the
# edible weight of one medium piece. food: (dataset, fdc_id, portion text as in food_portion.csv, unit shown).
# Foods with no fitting USDA portion (garlic head, parsley and spring onion bunch, pumpkin) are in the overrides.
USDA_DIR = ROOT / "data" / "raw" / "usda"
USDA_FILES = {"usda_sr_legacy": ("FoodData_Central_sr_legacy_food_csv_2018-04.zip", "sr_legacy_food"),
              "usda_foundation": ("FoodData_Central_foundation_food_csv_2026-04-30.zip", "foundation_food")}
SR = "usda_sr_legacy"
PIECES = {
    "potato": (SR, 170026, 'Potato medium (2-1/4" to 3-1/4" dia)', "1 medium"),
    "sweet potato": (SR, 168482, 'sweetpotato, 5" long', "1 piece"),
    "cucumber": (SR, 168409, 'cucumber (8-1/4")', "1 piece"),
    "red bell pepper": (SR, 170108, 'medium (approx 2-3/4" long, 2-1/2 dia.)', "1 medium"),
    "green bell pepper": (SR, 170427, 'medium (approx 2-3/4" long, 2-1/2" dia)', "1 medium"),
    "tomato": (SR, 170457, 'medium whole (2-3/5" dia)', "1 medium"),
    # USDA has no broccoli head; a stalk is one head with its stem (a USDA bunch, 608 g, is several stalks)
    "broccoli": (SR, 170379, "stalk", "1 head"),
    "zucchini": (SR, 169291, "medium", "1 medium"),
    "onion": (SR, 170000, 'medium (2-1/2" dia)', "1 medium"),
    "carrot": (SR, 170393, "medium", "1 medium"),
    "green beans": (SR, 169961, 'beans (4" long)', "10 beans"),
    "eggplant": (SR, 169228, "eggplant, unpeeled (approx 1-1/4 lb)", "1 piece"),
    "cauliflower": (SR, 169986, 'head medium (5-6" dia.)', "1 head"),
    "brussels sprouts": (SR, 170383, "sprout", "1 sprout"),
    # Hass (California) type, the usual avocado in Spain
    "avocado": (SR, 171706, "fruit, without skin and seed", "1 fruit"),
    "lemon": (SR, 167746, 'fruit (2-1/8" dia)', "1 fruit"),
    "lime": (SR, 168155, 'fruit (2" dia)', "1 fruit"),
    "pomegranate": (SR, 169134, 'pomegranate (4" dia)', "1 fruit"),
    "banana": (SR, 173944, 'medium (7" to 7-7/8" long)', "1 medium"),
    "apple": (SR, 171688, 'medium (3" dia)', "1 medium"),
    "orange": (SR, 169097, 'fruit (2-5/8" dia)', "1 fruit"),
    "kiwi": (SR, 168153, 'fruit (2" dia)', "1 fruit"),
    "lettuce": (SR, 169247, "head", "1 head"),  # romaine, the usual lettuce sold by the piece
}


def _grams(value):
    value = float(value)
    return int(value) if value.is_integer() else value


def load_usda_portions(fdc_ids, usda_dir=USDA_DIR):
    """{(dataset, fdc_id): {"food": description, "rows": [{amount, text, gram_weight}]}} for the given ids, read
    from the FDC bulk CSV zips in data/raw/usda (no network)."""
    import csv
    import io
    import zipfile
    wanted = {(d, str(i)) for d, i in fdc_ids}
    out = {}
    for dataset, (filename, data_type) in USDA_FILES.items():
        if not any(d == dataset for d, _ in wanted):
            continue
        with zipfile.ZipFile(usda_dir / filename) as archive:
            def table(name):
                inner = next(n for n in archive.namelist() if n.endswith("/" + name))
                return csv.DictReader(io.TextIOWrapper(archive.open(inner), encoding="utf-8"))
            for row in table("food.csv"):
                if (dataset, row["fdc_id"]) in wanted and row["data_type"] == data_type:
                    out[(dataset, int(row["fdc_id"]))] = {"food": row["description"], "rows": []}
            for row in table("food_portion.csv"):
                hit = out.get((dataset, int(row["fdc_id"]))) if (dataset, row["fdc_id"]) in wanted else None
                if hit is not None:
                    # SR Legacy keeps the portion text in modifier, Foundation in portion_description
                    text = row["modifier"] or row["portion_description"]
                    hit["rows"].append({"amount": float(row["amount"]), "text": text,
                                        "gram_weight": _grams(row["gram_weight"])})
    return out


def portion(usda, dataset, fdc_id, text):
    """The portion record packs.json keeps for one USDA portion row; raises when the row is not in the data."""
    food = usda.get((dataset, fdc_id))
    row = next((r for r in (food or {}).get("rows", []) if r["text"] == text), None)
    if row is None:
        raise LookupError(f"USDA portion {text!r} not found for {dataset} {fdc_id}")
    return {"source": dataset, "fdc_id": fdc_id, "food": food["food"],
            "description": f"{row['amount']:g} {text}", "gram_weight": row["gram_weight"]}


def piece_portions(overrides, usda_dir=USDA_DIR, pieces=None):
    """{food: {"unit", "portion"}} for the loose foods, and a check that every override portion matches USDA."""
    pieces = PIECES if pieces is None else pieces
    refs = [(d, i) for d, i, _, _ in pieces.values()]
    refs += [(o["portion"]["source"], o["portion"]["fdc_id"]) for o in overrides.values() if o.get("portion")]
    usda = load_usda_portions(refs, usda_dir)
    for food, item in overrides.items():
        p = item.get("portion")
        if p:
            text = p["description"].split(" ", 1)[1]
            found = portion(usda, p["source"], p["fdc_id"], text)
            if (found["gram_weight"], found["food"]) != (p["gram_weight"], p["food"]):
                raise ValueError(f"override portion for {food} does not match USDA: {found}")
    return {food: {"unit": unit, "portion": portion(usda, dataset, fdc_id, text)}
            for food, (dataset, fdc_id, text, unit) in pieces.items()}


def load_rows(path=RAW):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def matches(row, spec):
    """True when the product's name and categories fit one food spec."""
    _, name_re, cats, not_re, opts = spec
    text = plain(row.get("product_name", "") + " | " + row.get("generic_name", ""))
    if not re.search(name_re, text) or (opts.get("name_also") and not re.search(opts["name_also"], text)):
        return False
    if not_re and re.search(not_re, text):
        return False
    tags = set((row.get("categories_tags") or "").split(","))
    if tags & set(opts.get("not_cats", ())):
        return False
    # or_name: a name that proves the food even when the categories are missing
    return cats is None or bool(tags & set(cats)) or bool(opts.get("or_name") and re.search(opts["or_name"], text))


def typical_sizes(values):
    """2-3 most common sizes with their share of the parsed products."""
    counts = Counter(values)
    n = sum(counts.values())
    sizes = [(size, c) for size, c in counts.most_common() if c >= 2 and c / n >= MIN_SHARE][:MAX_SIZES]
    # Spread out sizes (spices): keep the most common one if at least 3 products share it
    if not sizes and counts and counts.most_common(1)[0][1] >= 3:
        sizes = counts.most_common(1)
    return n, [(size, round(c / n, 2)) for size, c in sizes]


def food_entry(food, spec, rows):
    """packs.json entry from OFF, or None when OFF is too thin."""
    sold_by, _, _, _, opts = spec
    seen, values = set(), []
    for row in rows:
        if row.get("code") in seen or not matches(row, spec):
            continue
        seen.add(row.get("code"))
        if sold_by == "per_unit":
            units = parse_units(row.get("quantity"))
            if units and 2 <= units <= 36:
                values.append(units)
        else:
            grams = parse_quantity(row.get("quantity"), row.get("product_quantity"), row.get("product_quantity_unit"),
                                   density=opts.get("density", 1.0), drained=opts.get("drained", False))
            if grams:
                values.append(grams)
    n, sizes = typical_sizes(values)
    if n < MIN_PRODUCTS or not sizes:
        return None, n
    notes = [f"Most common sizes among {n} Open Food Facts products sold in Spain."]
    if opts.get("drained"):
        notes.append("Drained weight where the label gives it.")
    if opts.get("density"):
        notes.append(f"Liquid: 1 ml counted as {opts['density']:g} g.")
    if sold_by == "per_unit":
        notes.append(f"Counted in eggs, size M ({EGG_GRAMS_M} g edible).")
        packs = [{"grams": u * EGG_GRAMS_M, "units": u, "share": share} for u, share in sizes]
        return {"sold_by": sold_by, "typical_packs": packs, "default_grams": packs[0]["grams"], "n_products": n,
                "units_per_pack": packs[0]["units"], "note": " ".join(notes), "source": "off"}, n
    packs = [{"grams": g, "share": share} for g, share in sizes]
    return {"sold_by": sold_by, "typical_packs": packs, "default_grams": packs[0]["grams"], "n_products": n,
            "note": " ".join(notes), "source": "off"}, n


def piece_entry(piece):
    """Loose food bought by the piece: one USDA portion is the unit, priced per kg like any loose item."""
    p = piece["portion"]
    grams = p["gram_weight"]
    return {"sold_by": "per_kg", "typical_packs": [{"grams": grams, "share": None}], "default_grams": grams,
            "n_products": 0, "unit": piece["unit"], "portion": p,
            "note": f"Loose, bought by the piece: {piece['unit']} = {grams:g} g edible weight (USDA FoodData Central, "
                    f"{p['food']}, fdc {p['fdc_id']}, {p['description']}). Edit the unit if yours differ.",
            "source": "usda_portion"}


def override_entry(item, n):
    entry = {k: v for k, v in item.items() if k != "reason"}
    entry.setdefault("default_grams", entry["typical_packs"][0]["grams"])
    if entry["sold_by"] == "per_unit":
        entry.setdefault("units_per_pack", entry["typical_packs"][0]["units"])
    entry["n_products"] = n
    entry["note"] = item["reason"]
    entry["source"] = "override"
    return entry


def build(rows, overrides, pieces=None):
    """pieces: {food: {"unit", "portion"}} from piece_portions; a loose food with neither a piece nor an override
    is listed as missing."""
    pieces = pieces or {}
    foods, n_off = {}, {}
    for food, spec in FOODS.items():
        if spec[0] == "per_kg":
            entry, n = (piece_entry(pieces[food]) if food in pieces else None), 0
        else:
            entry, n = food_entry(food, spec, rows)
        n_off[food] = n
        if food in overrides:
            entry = override_entry(overrides[food], n)
        if entry:
            foods[food] = entry
    return foods, n_off


def coverage_md(foods, n_off, date):
    groups = {"off": [], "usda_portion": [], "override": []}
    for food, entry in foods.items():
        groups[entry["source"]].append(food)
    missing = [f for f in FOODS if f not in foods]
    lines = ["# Pack size coverage", "",
             f"Built by `data/build/build_packs.py` from the Open Food Facts export of {date} (products sold in Spain)",
             "and USDA FoodData Central portion weights (loose produce).",
             f"{len(FOODS)} foods: {len(groups['off'])} from Open Food Facts, {len(groups['usda_portion'])} loose by the "
             f"piece (USDA portions), {len(groups['override'])} from overrides, {len(missing)} missing.", "",
             "## From Open Food Facts", "", "| Food | Products with a size | Typical packs (g, share) |", "|---|---|---|"]
    for food in groups["off"]:
        e = foods[food]
        sizes = ", ".join(f"{p.get('units', '')}{' eggs ' if 'units' in p else ''}{p['grams']} g {p['share']:.0%}"
                          for p in e["typical_packs"])
        lines.append(f"| {food} | {e['n_products']} | {sizes} |")
    lines += ["", "## Loose, bought by the piece (USDA FoodData Central portions)", "",
              "Sold per kg; one unit is the edible weight of one piece, from the USDA portion named.", "",
              "| Food | Unit | Grams | USDA food (fdc_id) | Portion |", "|---|---|---|---|---|"]
    for food in groups["usda_portion"]:
        e = foods[food]
        p = e["portion"]
        lines.append(f"| {food} | {e['unit']} | {e['default_grams']:g} | {p['food']} ({p['fdc_id']}) | {p['description']} |")
    lines += ["", "## From overrides (`data/build/packs-overrides.json`)", "",
              "| Food | OFF products with a size | Packs (g) | Reason |", "|---|---|---|---|"]
    for food in groups["override"]:
        e = foods[food]
        sizes = ", ".join(f"{p['grams']:g}" for p in e["typical_packs"])
        lines.append(f"| {food} | {n_off[food]} | {sizes} | {e['note']} |")
    lines += ["", "## Missing", "", ", ".join(missing) if missing else "None.", ""]
    return "\n".join(lines)


def write(foods, n_off, date, out=OUT):
    out.mkdir(parents=True, exist_ok=True)
    data = {"note": "Typical pack sizes per food. Built from Open Food Facts (ODbL 1.0, see LICENSE and SOURCES.md), "
                    "USDA FoodData Central portion weights for loose produce (CC0) and overrides. Prices are never "
                    "included: users add their own.",
            "export_date": date, "foods": foods}
    (out / "packs.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "coverage.md").write_text(coverage_md(foods, n_off, date), encoding="utf-8")


def review(rows, food, k=8):
    """Print the matched products of one food, to check its spec by eye."""
    spec = FOODS[food]
    hits = [r for r in rows if matches(r, spec)]
    print(f"{food}: {len(hits)} matched")
    for r in hits[:k]:
        print("  ", r.get("product_name", "")[:50], "|", r.get("quantity"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--review", help="print matched products for one food")
    args = ap.parse_args()
    if args.download:
        download()
    elif args.review:
        review(load_rows(), args.review, k=30)
    else:
        overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))["foods"]
        foods, n_off = build(load_rows(), overrides, piece_portions(overrides))
        write(foods, n_off, export_date())
        print(f"{len(foods)} of {len(FOODS)} foods written to {OUT / 'packs.json'}")
