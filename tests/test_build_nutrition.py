import importlib.util
import json
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_nutrition", ROOT / "data" / "build" / "build_nutrition.py")
build_nutrition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_nutrition)

ALIM = """<?xml version="1.0" encoding="utf-8" ?>
<TABLE>
   <ALIM><alim_code> 36017 </alim_code><alim_nom_fr> Poulet, filet sans peau cru </alim_nom_fr>
      <alim_nom_eng> Chicken, breast, without skin, raw </alim_nom_eng></ALIM>
   <ALIM><alim_code> 17270 </alim_code><alim_nom_fr> Huile d'olive vierge extra </alim_nom_fr>
      <alim_nom_eng> Olive oil, extra virgin </alim_nom_eng></ALIM>
   <ALIM><alim_code> 13136 </alim_code><alim_nom_fr> Framboise, surgelée, crue </alim_nom_fr>
      <alim_nom_eng> Raspberry, frozen, raw </alim_nom_eng></ALIM>
</TABLE>
"""


def compo(code, const, value):
    return (f"<COMPO><alim_code> {code} </alim_code><const_code> {const} </const_code>"
            f"<teneur> {value} </teneur><code_confiance> A </code_confiance></COMPO>")


COMPO = ("""<?xml version="1.0" encoding="utf-8" ?>\n<TABLE>"""
         + compo(36017, 328, "110") + compo(36017, 25000, "23,4") + compo(36017, 31000, "0")
         + compo(36017, 40000, "1,5") + compo(36017, 400, "75")  # water: ignored
         + compo(17270, 328, "899") + compo(17270, 25000, "&lt; 0,5") + compo(17270, 31000, "traces")
         + compo(17270, 40000, "99,9")
         + compo(13136, 328, "-") + compo(13136, 25000, "1")
         + "</TABLE>\n")

FOOD_CSV = ('"fdc_id","data_type","description","food_category_id","publication_date"\n'
            '"100","foundation_food","Turkey, ground, raw","5","2024-01-01"\n'
            '"101","sample_food","Turkey sample","5","2024-01-01"\n')
NUTRIENT_CSV = ('"id","fdc_id","nutrient_id","amount"\n'
                '"1","100","2048","157.6"\n"2","100","2047","160"\n"3","100","1003","17.3"\n'
                '"4","100","1085","9.6"\n"5","100","1050","0"\n"6","101","1008","999"\n')
SR_FOOD_CSV = ('"fdc_id","data_type","description","food_category_id","publication_date"\n'
               '"200","sr_legacy_food","Spices, onion powder","2","2019-04-01"\n')
SR_NUTRIENT_CSV = ('"id","fdc_id","nutrient_id","amount"\n'
                   '"1","200","1008","341"\n"2","200","1003","10.41"\n"3","200","1005","79.12"\n'
                   '"4","200","1004","1.04"\n"5","200","1050","50"\n')


def write_zip(path, folder, food_csv, nutrient_csv):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(f"{folder}/food.csv", food_csv)
        z.writestr(f"{folder}/food_nutrient.csv", nutrient_csv)


@pytest.fixture
def raw_dir(tmp_path):
    (tmp_path / "ciqual").mkdir()
    (tmp_path / "usda").mkdir()
    (tmp_path / "ciqual" / build_nutrition.CIQUAL_ALIM).write_text(ALIM, encoding="utf-8")
    (tmp_path / "ciqual" / build_nutrition.CIQUAL_COMPO).write_text(COMPO, encoding="utf-8")
    foundation, sr = build_nutrition.USDA_FILES["usda_foundation"][0], build_nutrition.USDA_FILES["usda_sr_legacy"][0]
    write_zip(tmp_path / "usda" / foundation, "foundation", FOOD_CSV, NUTRIENT_CSV)
    write_zip(tmp_path / "usda" / sr, "sr", SR_FOOD_CSV, SR_NUTRIENT_CSV)
    return tmp_path


FOOD_MAP = {
    "chicken breast": {"source": "ciqual", "id": "36017", "state": "raw", "note": "Raw breast."},
    "olive oil": {"source": "ciqual", "id": "17270", "state": "raw", "note": "Olive oil.",
                  "review": "Check the oil type."},
    "ground turkey": {"source": "usda_foundation", "id": "100", "state": "raw", "note": "Ground turkey."},
    "onion powder": {"source": "usda_sr_legacy", "id": "200", "state": "dry", "note": "Onion powder."},
}


@pytest.mark.parametrize("text,value", [("110", 110.0), ("23,4", 23.4), (" 0 ", 0.0), ("traces", 0.0),
                                        ("< 0,5", 0.0), ("-", None), ("", None), (None, None)])
def test_ciqual_value(text, value):
    assert build_nutrition.ciqual_value(text) == value


def test_load_ciqual_keeps_macros_only(raw_dir):
    foods = build_nutrition.load_ciqual(raw_dir / "ciqual")
    assert foods["36017"]["name"] == "Chicken, breast, without skin, raw"
    assert foods["36017"]["values"] == {"kcal": 110.0, "protein_g": 23.4, "carbs_g": 0.0, "fat_g": 1.5}
    assert foods["17270"]["values"]["protein_g"] == 0.0  # "< 0,5"
    assert foods["13136"]["values"]["kcal"] is None  # "-"


def test_load_usda_foundation_falls_back_to_atwater_and_nlea(raw_dir):
    path = raw_dir / "usda" / build_nutrition.USDA_FILES["usda_foundation"][0]
    foods = build_nutrition.load_usda(path, "foundation_food")
    assert set(foods) == {"100"}  # sample foods skipped
    assert foods["100"]["values"] == {"kcal": 157.6, "protein_g": 17.3, "carbs_g": 0.0, "fat_g": 9.6}


def test_load_usda_prefers_energy_and_carbs_by_difference(raw_dir):
    path = raw_dir / "usda" / build_nutrition.USDA_FILES["usda_sr_legacy"][0]
    values = build_nutrition.load_usda(path, "sr_legacy_food")["200"]["values"]
    assert values == {"kcal": 341.0, "protein_g": 10.41, "carbs_g": 79.12, "fat_g": 1.04}


def test_build_records_have_source_fields(raw_dir):
    foods = build_nutrition.build(FOOD_MAP, build_nutrition.load_sources(raw_dir))
    chicken = foods["chicken breast"]
    assert chicken == {"kcal": 110.0, "protein_g": 23.4, "carbs_g": 0.0, "fat_g": 1.5, "source": "ciqual",
                       "source_id": "36017", "source_name": "Chicken, breast, without skin, raw",
                       "state": "raw", "match_note": "Raw breast."}
    assert foods["ground turkey"]["source"] == "usda"
    assert foods["ground turkey"]["usda_dataset"] == "foundation"
    assert foods["onion powder"]["usda_dataset"] == "sr_legacy"


def test_build_rejects_unknown_id_bad_state_and_no_energy(raw_dir):
    sources = build_nutrition.load_sources(raw_dir)
    with pytest.raises(LookupError):
        build_nutrition.build_record("x", {"source": "ciqual", "id": "1", "state": "raw", "note": ""}, sources)
    with pytest.raises(ValueError):
        build_nutrition.build_record("x", {"source": "ciqual", "id": "36017", "state": "fresh", "note": ""},
                                     sources)
    with pytest.raises(ValueError):
        build_nutrition.build_record("x", {"source": "ciqual", "id": "13136", "state": "frozen", "note": ""},
                                     sources)


def test_main_writes_table_and_review(raw_dir, tmp_path):
    map_path = tmp_path / "map.json"
    map_path.write_text(json.dumps({"foods": FOOD_MAP, "dropped": {"whey": "Brand-only."}}), encoding="utf-8")
    out = tmp_path / "out"
    build_nutrition.main(["--raw", str(raw_dir), "--map", str(map_path), "--out", str(out)])
    table = json.loads((out / "per-100g.json").read_text(encoding="utf-8"))
    assert sorted(table["foods"]) == sorted(FOOD_MAP)
    review = (out / "review.md").read_text(encoding="utf-8")
    assert "**olive oil**: ciqual 17270" in review
    assert "Check the oil type." in review
    assert "**whey**: Brand-only." in review
    assert "chicken breast" not in review


def test_committed_table_matches_the_map():
    food_map = json.loads((ROOT / "data" / "build" / "nutrition-map.json").read_text(encoding="utf-8"))
    table = json.loads((ROOT / "data" / "open" / "nutrition" / "per-100g.json").read_text(encoding="utf-8"))
    assert sorted(table["foods"]) == sorted(food_map["foods"])
    assert not set(food_map["dropped"]) & set(food_map["foods"])
    for name, entry in food_map["foods"].items():
        record = table["foods"][name]
        assert record["source_id"] == entry["id"], name
        assert record["state"] == entry["state"], name
        assert record["source"] == ("ciqual" if entry["source"] == "ciqual" else "usda"), name


def test_committed_table_energy_is_close_to_macros():
    # 4/4/9 check catches a wrong column or kJ read as kcal. Ciqual carbs leave out fiber and
    # organic acids, which both count in energy, so spices, citrus and vinegar sit well above 4/4/9.
    foods = json.loads((ROOT / "data" / "open" / "nutrition" / "per-100g.json").read_text(encoding="utf-8"))["foods"]
    for name, r in foods.items():
        atwater = 4 * r["protein_g"] + 4 * r["carbs_g"] + 9 * r["fat_g"]
        assert abs(r["kcal"] - atwater) <= max(30, 0.5 * r["kcal"]), name


def test_english_names_cover_every_food():
    names = json.loads((ROOT / "data" / "open" / "english-names.json").read_text(encoding="utf-8"))["names"]
    foods = json.loads((ROOT / "data" / "open" / "nutrition" / "per-100g.json").read_text(encoding="utf-8"))["foods"]
    assert set(foods) <= set(names)


def test_map_keys_are_english_food_keys():
    food_map = json.loads((ROOT / "data" / "build" / "nutrition-map.json").read_text(encoding="utf-8"))
    keys = set(json.loads((ROOT / "data" / "open" / "aliases.json").read_text(encoding="utf-8"))["foods"])
    assert set(food_map["foods"]) | set(food_map["dropped"]) <= keys
