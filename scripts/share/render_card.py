#!/usr/bin/env python3
"""Render Alicia share cards (1200x630) from the blue-sky key visual.

The generator (scripts/share/cards.mjs) sends one JSON job on stdin:

    {"background": "/abs/public/images/summer-sky.webp",
     "format": "png",
     "jobs": [{"output": "/abs/card.png", "eyebrow": "ALICIA'S BLOG / LIFE",
               "title": "Written before 20", "description": "...",
               "signature": "Alicia", "footer": "nymphilia.com"}]}

Every card reuses the homepage wash colours and the same sky artwork, so a shared
link looks like the site it points at. Requires Pillow 9+ and a CJK-capable font;
macOS system fonts are used by default and SHARE_CARD_FONT_DIR can point at
another directory that holds the same file names.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
MARGIN = 72
COLUMN = 620
EYEBROW_TOP = 88
TITLE_TOP = 150
DESCRIPTION_GAP = 26
FOOTER_RULE_Y = 512
FOOTER_TEXT_TOP = 536

PAGE = "#f5faff"  # --hero wash base
WASH = "#f5faff"
BOTTOM_WASH = "#f4faff"
EYEBROW_INK = "#5286b4"
TITLE_INK = "#2e6fa8"
DESCRIPTION_INK = "#61778d"
FOOTER_INK = "#527697"
FOOTER_SOFT_INK = "#6493b6"
RULE_INK = "#d6e6f4"

# Fractions of the card width, mirroring the homepage hero wash.
HORIZONTAL_WASH = [(0.0, 255), (0.20, 248), (0.40, 232), (0.57, 188), (0.76, 0), (1.0, 0)]
# Fraction of the card height, from the bottom edge upwards.
VERTICAL_WASH = [(0.0, 204), (0.18, 0), (1.0, 0)]

FONT_FILES = {
    "display-latin": [
        ("/System/Library/Fonts/NewYorkItalic.ttf", 0),
        ("/System/Library/Fonts/Supplemental/Baskerville.ttc", 2),
        ("/System/Library/Fonts/Supplemental/Georgia Italic.ttf", 0),
    ],
    "display-cjk": [
        ("/System/Library/Fonts/Supplemental/Songti.ttc", 6),
        ("/System/Library/Fonts/Supplemental/Songti.ttc", 4),
        ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", 0),
    ],
    "sans-latin": [
        ("/System/Library/Fonts/HelveticaNeue.ttc", 0),
    ],
    "sans-cjk": [
        ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
        ("/System/Library/Fonts/Supplemental/Songti.ttc", 6),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
    ],
}

TITLE_SIZES = (62, 56, 50, 46, 42)
DESCRIPTION_SIZE = 20
EYEBROW_SIZE = 17
FOOTER_SIZE = 16
TITLE_LINE_HEIGHT = 1.22
DESCRIPTION_LINE_HEIGHT = 1.65

_font_cache = {}


def font(role, size):
    key = (role, size)
    if key not in _font_cache:
        override = os.environ.get("SHARE_CARD_FONT_DIR")
        candidates = FONT_FILES[role]
        if override:
            candidates = [(os.path.join(override, os.path.basename(path)), index) for path, index in candidates] + candidates
        for path, index in candidates:
            if not os.path.exists(path):
                continue
            try:
                _font_cache[key] = ImageFont.truetype(path, size, index=index)
                break
            except OSError:
                continue
        else:
            raise SystemExit(f"找不到可用的 {role} 字体；请安装中文字体或设置 SHARE_CARD_FONT_DIR")
    return _font_cache[key]


def is_cjk(character):
    code = ord(character)
    return (
        0x2E80 <= code <= 0x303F
        or 0x3040 <= code <= 0x30FF
        or 0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
        or 0xFE30 <= code <= 0xFE4F
        or 0xFF00 <= code <= 0xFFEF
    )


def segment(text, latin_role, cjk_role, size):
    """Pair every character with the font that can draw it."""
    latin = font(latin_role, size)
    cjk = font(cjk_role, size)
    return [(character, cjk if is_cjk(character) else latin) for character in text]


def measure(runs, spacing=0):
    return sum(font.getlength(character) for character, font in runs) + spacing * max(0, len(runs) - 1)


def wrap(runs, max_width, spacing=0):
    """Greedy wrap that keeps Latin words together and may break between CJK glyphs."""
    lines, current, width = [], [], 0.0
    for character, run_font in runs:
        if character == "\n":
            lines.append(current)
            current, width = [], 0.0
            continue
        step = run_font.getlength(character) + (spacing if current else 0)
        if current and width + step > max_width:
            cut = len(current)
            for index in range(len(current) - 1, -1, -1):
                if current[index][0] == " ":
                    cut = index + 1
                    break
            if 0 < cut < len(current):
                lines.append(current[:cut])
                current = current[cut:]
            else:
                lines.append(current)
                current = []
            width = measure(current, spacing)
            step = run_font.getlength(character) + (spacing if current else 0)
        current.append((character, run_font))
        width += step
    if current:
        lines.append(current)
    return [trim(line) for line in lines if trim(line)] or [[]]


def trim(line):
    while line and line[0][0] == " ":
        line = line[1:]
    while line and line[-1][0] == " ":
        line = line[:-1]
    return line


def ellipsize(line, max_width, spacing=0):
    characters = list(line)
    ellipsis = ("…", characters[-1][1] if characters else font("sans-cjk", DESCRIPTION_SIZE))
    while characters and measure(characters + [ellipsis], spacing) > max_width:
        characters.pop()
    while characters and characters[-1][0] == " ":
        characters.pop()
    return characters + [ellipsis]


def fit_title(title, max_width):
    for size in TITLE_SIZES:
        lines = wrap(segment(title, "display-latin", "display-cjk", size), max_width)
        if len(lines) <= 3:
            return size, lines
    size = TITLE_SIZES[-1]
    lines = wrap(segment(title, "display-latin", "display-cjk", size), max_width)
    lines = lines[:3]
    lines[-1] = ellipsize(lines[-1], max_width)
    return size, lines


def draw_lines(draw, lines, x, y, line_height, fill, spacing=0):
    for index, line in enumerate(lines):
        cursor = x
        top = y + index * line_height
        for character, line_font in line:
            draw.text((cursor, top), character, font=line_font, fill=fill)
            cursor += line_font.getlength(character) + spacing


def gradient_mask(stops, width, height):
    """Single-colour alpha ramp used for the hero-style washes."""
    mask = Image.new("L", (width, 1))
    mask.putdata([alpha_at(stops, index / max(1, width - 1)) for index in range(width)])
    return mask.resize((width, height), Image.NEAREST)


def vertical_gradient_mask(stops, width, height):
    stops = sorted(stops)
    mask = Image.new("L", (1, height))
    mask.putdata([alpha_at(stops, index / max(1, height - 1)) for index in range(height)])
    return mask.resize((width, height), Image.NEAREST)


def alpha_at(stops, position):
    for (start, start_alpha), (end, end_alpha) in zip(stops, stops[1:]):
        if position <= end:
            span = end - start
            ratio = 0 if span <= 0 else (position - start) / span
            return int(round(start_alpha + (end_alpha - start_alpha) * min(max(ratio, 0.0), 1.0)))
    return stops[-1][1]


def cover(background):
    """Cover-crop like the homepage hero: scale to fill, then anchor to the top."""
    ratio = max(WIDTH / background.width, HEIGHT / background.height)
    size = (max(WIDTH, round(background.width * ratio)), max(HEIGHT, round(background.height * ratio)))
    resized = background.resize(size, Image.LANCZOS)
    left = max(0, (resized.width - WIDTH) // 2)
    return resized.crop((left, 0, left + WIDTH, HEIGHT))


def draw_card(job, background):
    card = cover(background.convert("RGB"))
    card = Image.composite(Image.new("RGB", (WIDTH, HEIGHT), WASH), card, gradient_mask(HORIZONTAL_WASH, WIDTH, HEIGHT))
    card = Image.composite(
        Image.new("RGB", (WIDTH, HEIGHT), BOTTOM_WASH),
        card,
        vertical_gradient_mask([(1 - position, alpha) for position, alpha in VERTICAL_WASH], WIDTH, HEIGHT),
    )
    draw = ImageDraw.Draw(card)
    eyebrow = wrap(segment(job["eyebrow"], "sans-latin", "sans-cjk", EYEBROW_SIZE), COLUMN - 38, 2.6)
    if len(eyebrow) > 1:
        eyebrow = [ellipsize(eyebrow[0], COLUMN - 38, 2.6)]
    # The fine blue rule echoes the homepage eyebrow without adding a badge.
    draw.line((MARGIN, EYEBROW_TOP + 11, MARGIN + 22, EYEBROW_TOP + 11), fill=EYEBROW_INK, width=1)
    draw_lines(
        draw,
        eyebrow,
        MARGIN + 38,
        EYEBROW_TOP,
        EYEBROW_SIZE * 1.6,
        EYEBROW_INK,
        2.6,
    )
    size, title_lines = fit_title(job["title"], COLUMN)
    draw_lines(draw, title_lines, MARGIN, TITLE_TOP, size * TITLE_LINE_HEIGHT, TITLE_INK)
    description_lines = wrap(segment(job["description"], "sans-latin", "sans-cjk", DESCRIPTION_SIZE), COLUMN)
    if len(description_lines) > 2:
        description_lines = description_lines[:2]
        description_lines[-1] = ellipsize(description_lines[-1], COLUMN)
    title_bottom = TITLE_TOP + len(title_lines) * size * TITLE_LINE_HEIGHT
    draw_lines(
        draw,
        description_lines,
        MARGIN,
        title_bottom + DESCRIPTION_GAP,
        DESCRIPTION_SIZE * DESCRIPTION_LINE_HEIGHT,
        DESCRIPTION_INK,
    )
    draw.line((MARGIN, FOOTER_RULE_Y, MARGIN + COLUMN, FOOTER_RULE_Y), fill=RULE_INK, width=1)
    footer = segment(job["footer"], "sans-latin", "sans-cjk", FOOTER_SIZE)
    right = MARGIN + COLUMN - measure(footer)
    signature_width = right - MARGIN - 32
    signature = segment(job["signature"], "display-latin", "display-cjk", 26)
    if measure(signature) > signature_width:
        signature = ellipsize(signature, signature_width)
    draw_lines(draw, [signature], MARGIN, FOOTER_TEXT_TOP - 5, 0, FOOTER_INK)
    draw_lines(draw, [footer], right, FOOTER_TEXT_TOP + 4, 0, FOOTER_SOFT_INK)
    return card


def main():
    request = json.load(sys.stdin)
    background = Image.open(request["background"])
    written = []
    for job in request["jobs"]:
        card = draw_card(job, background)
        os.makedirs(os.path.dirname(job["output"]), exist_ok=True)
        if request.get("format") == "jpeg":
            card.save(job["output"], "JPEG", quality=88, optimize=True, progressive=True)
        elif request.get("format") == "webp":
            card.save(job["output"], "WEBP", quality=88, method=6)
        else:
            card.save(job["output"], "PNG", optimize=True)
        written.append({"output": job["output"], "bytes": os.path.getsize(job["output"])})
    json.dump({"cards": written}, sys.stdout)
    print()


if __name__ == "__main__":
    main()
