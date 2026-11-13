#!/usr/bin/env python3
# Usage: python3 art/make-ink-icons.py
#
# Cuts art/ink-icons/ink-icons-sheet.png, a sheet of 20 brush-painted icons from
# gpt-image-2.6-sunburst (the prompt is in RECIPE.md), into one SVG per icon in
# mods/paper-pane/ink/. Each SVG is a single-colour outline, so Herdr tints it with
# the text colour: ink on paper and tape, cream on the wood.
#
# The icons aren't on an exact grid, so the sheet is cut at its widest blank bands:
# the 3 widest between rows, then the 4 widest between icons in each row (an icon
# such as the four arrows has narrower blank bands inside it). Each icon is centred
# in a square with a margin and traced with potrace.
#
# Needs ImageMagick and potrace (brew install imagemagick potrace); no Python packages.
import os, re, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "art", "ink-icons", "ink-icons-sheet.png")
OUT = os.path.join(ROOT, "mods", "paper-pane", "ink")
NAMES = [
    ["file", "branch", "layers", "chevron-down", "plus"],
    ["x", "search", "sidebar", "settings", "eye"],
    ["split-right", "split-down", "zoom", "unzoom", "pin"],
    ["terminal", "chevron-right", "monitor", "clock", "folder"],
]
INK_BELOW = 128     # a pixel darker than this is ink
MARGIN = 0.09       # blank border round each icon, as a share of the square's side
SIDE = 512          # the square each icon is traced at


def read_ink(path):
    """The sheet as rows of booleans: True where there is ink."""
    pgm = subprocess.run(["magick", path, "-colorspace", "Gray", "-depth", "8", "pgm:-"], check=True, capture_output=True).stdout
    header = re.match(rb"P5\s+(\d+)\s+(\d+)\s+(\d+)\s", pgm)
    assert header, "magick didn't write a binary PGM"
    w, h = int(header.group(1)), int(header.group(2))
    data = pgm[header.end():]
    return [[data[y * w + x] < INK_BELOW for x in range(w)] for y in range(h)]


def bands(filled, parts):
    """Splits a run of filled/blank flags into `parts` spans at its widest blank bands."""
    first = filled.index(True)
    last = len(filled) - 1 - filled[::-1].index(True)
    gaps, start = [], None
    for i in range(first, last + 1):
        if not filled[i] and start is None:
            start = i
        if filled[i] and start is not None:
            gaps.append((i - start, start, i))
            start = None
    cuts = sorted(sorted(gaps, reverse=True)[: parts - 1], key=lambda g: g[1])
    edges = [first] + [e for _, s, e in cuts for e in (s, e)] + [last + 1]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]


def main():
    ink = read_ink(SHEET)
    os.makedirs(OUT, exist_ok=True)
    rows = bands([any(row) for row in ink], len(NAMES))
    with tempfile.TemporaryDirectory() as tmp:
        for (top, bottom), names in zip(rows, NAMES):
            columns = bands([any(ink[y][x] for y in range(top, bottom)) for x in range(len(ink[0]))], len(names))
            for (left, right), name in zip(columns, names):
                # The row's band is as tall as its tallest icon: trim to this icon's own ink.
                ys = [y for y in range(top, bottom) if any(ink[y][left:right])]
                y0, y1 = ys[0], ys[-1] + 1
                w, h = right - left, y1 - y0
                inner = round(SIDE * (1 - 2 * MARGIN))
                pbm, svg = os.path.join(tmp, name + ".pbm"), os.path.join(OUT, name + ".svg")
                subprocess.run(["magick", SHEET, "-crop", f"{w}x{h}+{left}+{y0}", "+repage",
                                "-resize", f"{inner}x{inner}", "-gravity", "center", "-background", "white",
                                "-extent", f"{SIDE}x{SIDE}", "-colorspace", "Gray", "-threshold", "50%", pbm], check=True)
                traced = subprocess.run(["potrace", pbm, "--svg", "--turdsize", "6", "--opttolerance", "0.3", "-o", "-"],
                                        check=True, capture_output=True, text=True).stdout
                found = re.search(r"<g transform=.*?</g>", traced, re.S)
                assert found, f"potrace traced nothing for {name}"
                group = re.sub(r'\s*fill="#000000" stroke="none"', "", found.group(0))
                # potrace draws in tenths of a pixel, flipped; its group transform puts that right.
                with open(svg, "w") as f:
                    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIDE} {SIDE}" fill="currentColor">\n{group}\n</svg>\n')
                print(f"{name:14} {w}x{h} at {left},{y0}")


main()
