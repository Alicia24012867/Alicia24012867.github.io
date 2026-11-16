#!/usr/bin/env python3
"""Give the curly quotes of the site's Noto Sans SC a Latin width for text outside Chinese.

Google's Noto Sans SC draws ‘ ’ “ ” full width, as Chinese text sets them, and leaves out
the font's proportional forms, so English text shows a gap after each of them.
scripts/fonts.mjs runs this after fetching the fonts:

    python3 scripts/proportional_quotes.py <noto-sans-sc latin.woff2> <noto-sans-jp quotes.woff2> <out.woff2>

The output keeps the four quotes of the Noto Sans SC slice as they are and adds the quotes
of Noto Sans JP, the same typeface with Latin-width quotes and the same weights, as the
stylistic set 'ss01'. global.css asks for that set outside Chinese text, and from this
family alone, so other fonts with width features (such as the system fonts that draw
Chinese in code) keep theirs. Requires fontTools and brotli (python3 -m pip install
fonttools brotli).
"""

import copy
import sys

from fontTools import subset
from fontTools.otlLib.builder import buildLookup, buildSingleSubstSubtable
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables
from fontTools.varLib.hvar import add_HVAR

QUOTES = [0x2018, 0x2019, 0x201C, 0x201D]


def quotes_of(chinese_path):
    """The four quotes of the slice, with every layout feature and glyph they use."""
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    font = subset.load_font(chinese_path, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=QUOTES)
    subsetter.subset(font)
    return font


def variation(font):
    axes = [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue) for axis in font["fvar"].axes]
    return font["head"].unitsPerEm, axes, font["avar"].segments if "avar" in font else None


def add_feature(font, tag, mapping):
    """Adds a GSUB feature that substitutes `mapping` in every script and language."""
    gsub = font["GSUB"].table
    gsub.LookupList.Lookup.append(buildLookup([buildSingleSubstSubtable(mapping)]))
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)
    record = otTables.FeatureRecord()
    record.FeatureTag = tag
    record.Feature = otTables.Feature()
    record.Feature.FeatureParams = None
    record.Feature.LookupListIndex = [gsub.LookupList.LookupCount - 1]
    record.Feature.LookupCount = 1
    records = gsub.FeatureList.FeatureRecord + [record]
    # OpenType keeps the feature list sorted by tag; renumber what points into it.
    order = sorted(range(len(records)), key=lambda index: records[index].FeatureTag)
    renumber = {old: new for new, old in enumerate(order)}
    gsub.FeatureList.FeatureRecord = [records[index] for index in order]
    gsub.FeatureList.FeatureCount = len(records)
    for script in gsub.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys]
        systems += [system.LangSys for system in script.Script.LangSysRecord]
        for system in filter(None, systems):
            if system.ReqFeatureIndex != 0xFFFF:
                system.ReqFeatureIndex = renumber[system.ReqFeatureIndex]
            system.FeatureIndex = [renumber[index] for index in system.FeatureIndex]
            system.FeatureIndex.append(renumber[len(records) - 1])
            system.FeatureCount = len(system.FeatureIndex)


def main(chinese_path, latin_path, output):
    font = quotes_of(chinese_path)
    latin = TTFont(latin_path)
    if variation(font) != variation(latin):
        raise SystemExit("The two fonts have different units or weights; their glyphs do not mix")
    chinese_map, latin_map = font.getBestCmap(), latin.getBestCmap()
    em = font["head"].unitsPerEm
    forms = {}
    for code in QUOTES:
        glyph, source = chinese_map[code], latin_map[code]
        if font["hmtx"][glyph][0] != em or latin["hmtx"][source][0] >= em:
            raise SystemExit(f"U+{code:04X} is not full width in one font and narrower in the other")
        form = forms[glyph] = glyph + ".latn"
        font["glyf"][form] = copy.deepcopy(latin["glyf"][source])
        font["hmtx"][form] = latin["hmtx"][source]
        font["vmtx"][form] = latin["vmtx"][source]
        font["gvar"].variations[form] = copy.deepcopy(latin["gvar"].variations[source])
    order = [glyph for glyph in font.getGlyphOrder() if glyph not in forms.values()]
    order += forms.values()
    font.setGlyphOrder(order)
    font["glyf"].setGlyphOrder(order)
    classes = font["GDEF"].table.GlyphClassDef if "GDEF" in font else None
    for glyph, form in forms.items():
        if classes and glyph in classes.classDefs:
            classes.classDefs[form] = classes.classDefs[glyph]
    add_feature(font, "ss01", forms)
    # Each weight's advance widths come from the glyph variations, the new glyphs' included.
    add_HVAR(font)
    font.recalcBBoxes = True
    font.flavor = "woff2"
    font.save(output)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
