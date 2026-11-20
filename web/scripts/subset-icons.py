"""Trim the Font Awesome Free icon fonts to the icons the site uses (decided 2026-11-20).

The full solid font is 150 KB (woff2); the site uses under 100 icons. This script:
1. collects every `fa-<name>` written in app/, components/ and lib/ (all icons are written as full class names),
2. keeps the core rules of fontawesome.min.css and only the icon rules for those names,
3. subsets the solid and regular woff2 fonts to those code points.

The output goes to app/icons/ (CSS + fonts, imported by app/layout.js). Run it again after adding an icon:
    ../.venv/bin/python scripts/subset-icons.py      (from web/; needs fonttools + brotli, requirements-dev.txt)
tests/test_icons.py fails when an icon in the code is missing from the trimmed CSS or font.

License: the fonts are SIL OFL 1.1 with the Reserved Font Name "Font Awesome", and a subset is a Modified Version,
so the trimmed fonts and their CSS family are named "SmartBite Icons". The CSS and icons keep their license header.
"""

import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

WEB = Path(__file__).resolve().parent.parent
FA = WEB / "node_modules" / "@fortawesome" / "fontawesome-free"
OUT = WEB / "app" / "icons"
SOURCES = [WEB / "app", WEB / "components", WEB / "lib"]
FAMILY = "SmartBite Icons"
FA_FAMILY = '"Font Awesome 6 Free"'
FONTS = {"solid": ("fa-solid-900.woff2", 900), "regular": ("fa-regular-400.woff2", 400)}

TOKEN = re.compile(r"\bfa-[a-z0-9]+(?:-[a-z0-9]+)*")
# One icon rule in fontawesome.min.css: `.fa-a:before,.fa-b:before{content:"\f2e7"}`
ICON_RULE = re.compile(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-f]+)"\}')


def used_names():
    names = set()
    for root in SOURCES:
        for path in sorted(root.rglob("*")):
            if path.suffix in {".js", ".jsx", ".mjs"} and OUT not in path.parents:
                names.update(TOKEN.findall(path.read_text(encoding="utf-8")))
    return names


def trimmed_css(names):
    """Core rules unchanged, icon rules only for used names. Returns (css, code points)."""
    css = (FA / "css" / "fontawesome.min.css").read_text(encoding="utf-8")
    header, body = css.split("*/", 1)
    points = set()

    def keep(match):
        selectors = [s for s in match.group(1).rstrip(",").split(",") if s[1:-len(":before")] in names]
        if not selectors:
            return ""
        points.add(int(match.group(2), 16))
        return ",".join(selectors) + '{content:"\\' + match.group(2) + '"}'

    body = ICON_RULE.sub(keep, body).replace(FA_FAMILY, f'"{FAMILY}"')
    faces = "".join(
        f'@font-face{{font-family:"{FAMILY}";font-style:normal;font-weight:{weight};font-display:block;'
        f'src:url(./{file}) format("woff2")}}'
        for file, weight in FONTS.values()
    )
    styles = (f':root{{--fa-style-family-classic:"{FAMILY}";--fa-font-solid:normal 900 1em/1 "{FAMILY}";'
              f'--fa-font-regular:normal 400 1em/1 "{FAMILY}"}}.fa-solid,.fas{{font-weight:900}}'
              f'.fa-regular,.far{{font-weight:400}}')
    note = ("\n * Trimmed by web/scripts/subset-icons.py to the icons SmartBite uses; fonts renamed "
            f'"{FAMILY}" (OFL Reserved Font Name).\n */')
    return header + note + "\n" + styles + faces + body.strip() + "\n", points


def subset_font(file, points):
    font = TTFont(FA / "webfonts" / file.replace(".woff2", ".ttf"))  # its woff2 files do not decompress in fontTools
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=points)
    sub.subset(font)
    style = "Solid" if "solid" in file else "Regular"
    for record in font["name"].names:
        if record.nameID in (1, 16):
            record.string = FAMILY
        elif record.nameID in (3, 4):
            record.string = f"{FAMILY} {style}"
        elif record.nameID == 6:
            record.string = f"SmartBiteIcons-{style}"
    font.flavor = "woff2"
    font.save(OUT / file)


def main():
    names = used_names()
    css, points = trimmed_css(names)
    OUT.mkdir(exist_ok=True)
    (OUT / "fontawesome.css").write_text(css, encoding="utf-8")
    for file, _ in FONTS.values():
        subset_font(file, points)
    sizes = {p.name: p.stat().st_size for p in sorted(OUT.iterdir())}
    print(f"{len(names)} fa- names in the code, {len(points)} icons kept")
    for name, size in sizes.items():
        print(f"  {name}: {size:,} bytes")


if __name__ == "__main__":
    main()
