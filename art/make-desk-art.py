#!/usr/bin/env python3
# Usage: python3 art/make-desk-art.py
#
# Draws the paper-desk layout's marks (no Python packages; the PNGs need
# ImageMagick's `magick`, and the stamp needs macOS's DIN Condensed Bold):
#
#   mods/paper-agents/ink-ring.svg     a brushed ink ring with a gap, which spins while an agent works
#   mods/paper-agents/ink-tick.svg     a brushed tick, for a finished agent
#   mods/paper-agents/ink-idle.svg     a thin pencil circle, for an idle agent
#   mods/paper-agents/stamp-*.png      a worn rubber stamp, NEEDS YOU, for light and dark paper
#   mods/paper-pane/tape-*.png         the two torn ends of a strip of masking tape
#   mods/appearance-toggle/ink-*.svg   a brushed moon and sun, for the light/dark button
#
# The SVGs are one filled outline each, so Herdr tints them with the text colour.
# Everything is seeded: running it again writes the same files.
import math, os, random, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENTS = os.path.join(ROOT, "mods", "paper-agents")
PANE = os.path.join(ROOT, "mods", "paper-pane")
TOGGLE = os.path.join(ROOT, "mods", "appearance-toggle")
STAMP_FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
TAPE = "#e6d6a2"          # paper-pane/main.js fills the strip between the ends with the same colour
STAMP_INK = {"light": "#b3261a", "dark": "#f0604d"}


def wobble(rng, terms):
    """A smooth periodic noise: a few sines with random phase."""
    parts = [(rng.uniform(0.4, 1.0) / k, k, rng.uniform(0, math.tau)) for k in terms]
    return lambda a: sum(amp * math.sin(k * a + ph) for amp, k, ph in parts)


def stroke(points, widths):
    """The outline of a brush stroke along `points`, `widths[i]` wide at each point."""
    left, right = [], []
    for i, (x, y) in enumerate(points):
        x0, y0 = points[max(i - 1, 0)]
        x1, y1 = points[min(i + 1, len(points) - 1)]
        d = math.hypot(x1 - x0, y1 - y0) or 1
        nx, ny = -(y1 - y0) / d, (x1 - x0) / d
        h = widths[i] / 2
        left.append((x + nx * h, y + ny * h))
        right.append((x - nx * h, y - ny * h))
    return left + right[::-1]


def path(outline):
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in outline) + " Z"


def write_svg(name, outlines, folder=AGENTS):
    body = "".join(f'<path d="{path(o)}"/>' for o in outlines)
    with open(os.path.join(folder, name), "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor">{body}</svg>\n')


def ring(seed, start, sweep, radius, thick_from, thick_to, rough):
    """A ring drawn in one turn of the brush: loaded where it lands, dry where it lifts."""
    rng = random.Random(seed)
    r_noise, w_noise = wobble(rng, [1, 2, 3, 5]), wobble(rng, [3, 5, 8, 13])
    n = 220
    pts, widths = [], []
    for i in range(n + 1):
        f = i / n
        a = start + sweep * f
        r = radius + rough * 1.6 * r_noise(a)
        pts.append((50 + r * math.cos(a), 50 + r * math.sin(a)))
        # Rounded where the brush lands, a long taper where it lifts off.
        land = min(1, f / 0.05) ** 0.5
        lift = min(1, (1 - f) / 0.22) ** 0.8
        widths.append(max(0.6, (thick_from + (thick_to - thick_from) * f + rough * w_noise(a)) * land * lift))
    return stroke(pts, widths)


def tick(seed):
    rng = random.Random(seed)
    w_noise = wobble(rng, [2, 5, 9])
    corners = [(17, 50), (39, 77), (86, 19)]
    pts, widths = [], []
    n = 60
    for i in range(n + 1):
        f = i / n
        # A third of the stroke goes down to the corner, the rest flicks up.
        if f < 0.32:
            g = f / 0.32
            (x0, y0), (x1, y1) = corners[0], corners[1]
        else:
            g = (f - 0.32) / 0.68
            (x0, y0), (x1, y1) = corners[1], corners[2]
        bow = math.sin(g * math.pi) * (2.0 if f < 0.32 else -3.5)
        pts.append((x0 + (x1 - x0) * g + bow, y0 + (y1 - y0) * g))
        land = min(1, f / 0.06) ** 0.5
        lift = min(1, (1 - f) / 0.45) ** 0.9
        widths.append(max(0.8, (13 - 4 * f + 1.2 * w_noise(f * math.tau)) * land * lift))
    return stroke(pts, widths)


def moon(seed):
    """A crescent: round the outside of one disc, then back along a second disc that bites into it."""
    rng = random.Random(seed)
    rough = wobble(rng, [2, 3, 5, 8])
    (x1, y1, r1), (x2, y2, r2) = (47, 54, 38), (63, 40, 31)
    d = math.hypot(x2 - x1, y2 - y1)
    along = (r1 * r1 - r2 * r2 + d * d) / (2 * d)       # from the first centre to the line through the two horns
    away = math.atan2(y1 - y2, x1 - x2)                 # the direction the crescent's back faces
    half1 = math.pi - math.acos(along / r1)             # half the outer arc
    half2 = math.acos((d - along) / r2)                 # half the bite
    n = 60
    outer = [away - half1 + 2 * half1 * i / n for i in range(n + 1)]
    inner = [away + half2 - 2 * half2 * i / n for i in range(n + 1)]
    return ([(x1 + (r1 + 0.8 * rough(a)) * math.cos(a), y1 + (r1 + 0.8 * rough(a)) * math.sin(a)) for a in outer]
            + [(x2 + (r2 + 0.8 * rough(a + 1)) * math.cos(a), y2 + (r2 + 0.8 * rough(a + 1)) * math.sin(a)) for a in inner[1:-1]])


def sun(seed):
    """A small brushed ring and eight rays flicked outwards."""
    rng = random.Random(seed)
    outlines = [ring(seed, 0.3, 6.5, 17, 7.5, 6, 0.4)]
    for k in range(8):
        a = k * math.tau / 8 + rng.uniform(-0.07, 0.07)
        r0, r1 = 29 + rng.uniform(-1, 1), 44 + rng.uniform(-2.5, 2)
        n = 10
        pts = [(50 + (r0 + (r1 - r0) * i / n) * math.cos(a), 50 + (r0 + (r1 - r0) * i / n) * math.sin(a)) for i in range(n + 1)]
        widths = [max(1.2, 7.5 * (1 - i / n) ** 0.7) for i in range(n + 1)]
        outlines.append(stroke(pts, widths))
    return outlines


def magick(*args):
    subprocess.run(["magick", *args], check=True)


def stamp(name, ink, seed):
    """NEEDS YOU in a ruled box, tilted, with the ink worn off in patches. 3x: shown at 96 x 40."""
    out = os.path.join(AGENTS, name)
    w, h = 258, 84
    with tempfile.TemporaryDirectory() as tmp:
        worn = os.path.join(tmp, "worn.png")
        magick(
            # The stamp's shape, white on black...
            "-size", f"{w}x{h}", "xc:black",
            "-fill", "none", "-stroke", "white", "-strokewidth", "7",
            "-draw", f"roundrectangle 5,5 {w - 6},{h - 6} 9,9",
            "-font", STAMP_FONT, "-pointsize", "56", "-kerning", "3",
            "-fill", "white", "-stroke", "none", "-gravity", "center", "-annotate", "+1+8", "NEEDS YOU",
            # ...times blurred noise, so the ink is missing in patches.
            "(", "-size", f"{w}x{h}", "xc:", "-seed", str(seed), "+noise", "Random", "-colorspace", "Gray",
            "-blur", "0x2.2", "-auto-level", "-level", "30%,47%", ")",
            "-compose", "Multiply", "-composite", worn,
        )
        # That is the opacity of a sheet of ink.
        magick(
            worn, "-background", ink, "-alpha", "shape",
            "-background", "none", "-rotate", "-5", "-blur", "0x0.4",
            "-gravity", "center", "-extent", "288x120", out,
        )


def tape_end(name, seed, flop):
    """One torn end of the tape: 3x, shown 9 px wide and 22 px high; the tear faces left."""
    rng = random.Random(seed)
    w, h = 27, 66
    pts, y = [(float(w), 0.0)], 0.0
    while y < h:
        pts.append((rng.uniform(1, 9), y))
        y += rng.uniform(4, 9)
    pts += [(rng.uniform(1, 9), float(h)), (float(w), float(h))]
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    args = ["-size", f"{w}x{h}", "xc:none", "-fill", TAPE, "-draw", f"polygon {poly}"]
    if flop:
        args.append("-flop")
    magick(*args, os.path.join(PANE, name))


write_svg("ink-ring.svg", [ring(7, -1.9, 5.45, 37, 13, 5, 1.0)])
write_svg("ink-tick.svg", [tick(3)])
write_svg("ink-idle.svg", [ring(11, 0.4, 6.6, 38, 5.5, 4.5, 0.5)])
write_svg("ink-moon.svg", [moon(4)], TOGGLE)
write_svg("ink-sun.svg", sun(6), TOGGLE)
for look, ink in STAMP_INK.items():
    stamp(f"stamp-{look}.png", ink, 20261112)
tape_end("tape-left.png", 5, False)
tape_end("tape-right.png", 9, True)
print("wrote the marks into", AGENTS, PANE, "and", TOGGLE)
