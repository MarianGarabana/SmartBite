"""The trimmed icon font (web/scripts/subset-icons.py) has every icon the web code uses."""

import importlib.util
import re
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parent.parent / "web"
ICONS = WEB / "app" / "icons"
fontTools = pytest.importorskip("fontTools.ttLib")  # requirements-dev.txt

spec = importlib.util.spec_from_file_location("subset_icons", WEB / "scripts" / "subset-icons.py")
subset_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subset_icons)

CSS = (ICONS / "fontawesome.css").read_text(encoding="utf-8")
RULE = re.compile(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-f]+)"\}')
ICON_POINTS = {s[1:-len(":before")]: int(m.group(2), 16)
               for m in RULE.finditer(CSS) for s in m.group(1).rstrip(",").split(",")}


def test_every_name_in_the_code_is_an_icon_or_a_core_class():
    missing = sorted(n for n in subset_icons.used_names() if n not in ICON_POINTS and f".{n}" not in CSS)
    assert not missing, f"run scripts/subset-icons.py: {missing}"


@pytest.mark.parametrize("file", ["fa-solid-900.woff2", "fa-regular-400.woff2"])
def test_fonts_have_every_icon_and_the_new_name(file):
    font = fontTools.TTFont(ICONS / file)
    cmap = font.getBestCmap()
    if "solid" in file:  # every free icon used is in the solid style
        assert not sorted(n for n, p in ICON_POINTS.items() if p not in cmap)
    assert font["name"].getDebugName(1) == subset_icons.FAMILY  # OFL Reserved Font Name not reused


def test_css_uses_only_the_trimmed_fonts():
    assert "Font Awesome 6 Free" not in CSS
    assert "../webfonts" not in CSS
    assert CSS.count("@font-face") == 2
