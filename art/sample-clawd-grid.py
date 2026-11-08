#!/usr/bin/env python3
# Usage: python3 art/sample-clawd-grid.py art/clawd-ram-gpt.png mods/clawdr-chrome/clawd-ram-gpt.svg [art/clawd-ram-gpt-grid.png]
#
# Samples a generated picture of Clawd with horns back onto Clawd's pixel grid.
# Clawd's body is 16 x 10 pixels, so its bounding box in the picture gives the grid:
# column pitch = box width / 16, row pitch = box height / 10, origin = the box corner.
# The grid is extended over the whole picture, and each cell takes the palette colour
# most of its middle agrees on. Writes the SVG and, if a third path is given, the picture
# with the grid and the sampled colours drawn on, and prints the cell map with any body
# cells that differ from Clawd's.
import math, subprocess, struct, sys, zlib

BODY, HORN, RIDGE = (0xD9, 0x77, 0x57), (0xEF, 0xE4, 0xCC), (0xB8, 0x9B, 0x70)
PALETTE = {"O": BODY, "H": HORN, "R": RIDGE}
PX = 1.5   # one cell in SVG units: a Clawd pixel in Herdr's 24-unit icon
CLAWD = ["..OOOOOOOOOOOO..", "..OOOOOOOOOOOO..", "..OO.OOOOOO.OO..", "..OO.OOOOOO.OO..",
         "OOOOOOOOOOOOOOOO", "OOOOOOOOOOOOOOOO", "..OOOOOOOOOOOO..", "..OOOOOOOOOOOO..",
         "...O.O....O.O...", "...O.O....O.O..."]

def load(path):
    w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout.split(","))
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return w, h, raw

def write_png(path, w, h, buf):
    rows = b"".join(b"\0" + bytes(buf[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))

def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

src, svg_out = sys.argv[1], sys.argv[2]
w, h, img = load(src)
px = lambda x, y: tuple(img[(y * w + x) * 3:(y * w + x) * 3 + 3])

# Background: the per-channel median along the picture's border.
border = [px(x, 0) for x in range(w)] + [px(x, h - 1) for x in range(w)]
bg = tuple(sorted(ch)[len(ch) // 2] for ch in zip(*border))
def classify(c):
    return "." if dist(c, bg) < 45 else min(PALETTE, key=lambda k: dist(c, PALETTE[k]))

# The body's box: columns and rows holding a run of body-coloured pixels (a stray
# orange speck doesn't count).
colN, rowN = [0] * w, [0] * h
for y in range(h):
    for x in range(w):
        if dist(px(x, y), BODY) < 30:
            colN[x] += 1
            rowN[y] += 1
xs = [x for x in range(w) if colN[x] >= 8]
ys = [y for y in range(h) if rowN[y] >= 8]
bx, by = xs[0], ys[0]
p, q = (xs[-1] + 1 - bx) / 16, (ys[-1] + 1 - by) / 10
print(f"body box {bx},{by} to {xs[-1]},{ys[-1]}: cell {p:.2f} x {q:.2f} px", file=sys.stderr)

# Every cell of the grid the body defines, over the whole picture. Columns and rows
# are numbered from the body's corner, so the body is columns 0-15, rows 0-9.
cmin, cmax = -int(bx // p), int((w - bx) // p) - 1
rmin, rmax = -int(by // q), int((h - by) // q) - 1
grid, doubt = {}, []
for r in range(rmin, rmax + 1):
    for c in range(cmin, cmax + 1):
        cx, cy = bx + (c + 0.5) * p, by + (r + 0.5) * q
        ax, ay = int(0.3 * p), int(0.3 * q)
        votes = [classify(px(x, y)) for y in range(int(cy) - ay, int(cy) + ay + 1)
                 for x in range(int(cx) - ax, int(cx) + ax + 1)]
        k = max(set(votes), key=votes.count)
        if votes.count(k) / len(votes) < 0.75:
            doubt.append((c, r, k, round(votes.count(k) / len(votes), 2)))
        if k != ".":
            grid[(c, r)] = k

off = [(c, r, grid.get((c, r), ".")) for r in range(10) for c in range(16)
       if (grid.get((c, r)) == "O") != (CLAWD[r][c] == "O")]
cs, rs = [c for c, _ in grid], [r for _, r in grid]
c0, c1, r0, r1 = min(cs), max(cs), min(rs), max(rs)
for r in range(r0, r1 + 1):
    print("".join(grid.get((c, r), ".") for c in range(c0, c1 + 1)))
print(f"{c1 - c0 + 1} x {r1 - r0 + 1} cells, body at column {-c0}, row {-r0}", file=sys.stderr)
print(f"body cells that differ from Clawd's: {off or 'none'}", file=sys.stderr)
print(f"cells under 75% agreement: {doubt or 'none'}", file=sys.stderr)

# The overlay: grid lines in cyan, a dot of the sampled colour in each filled cell.
if len(sys.argv) > 3:
    out = bytearray(img)
    def put(x, y, col):
        if 0 <= x < w and 0 <= y < h:
            out[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes(col)
    for c in range(cmin, cmax + 2):
        for y in range(h):
            put(round(bx + c * p), y, (0, 220, 255))
    for r in range(rmin, rmax + 2):
        for x in range(w):
            put(x, round(by + r * q), (0, 220, 255))
    for (c, r), k in grid.items():
        cx, cy = round(bx + (c + 0.5) * p), round(by + (r + 0.5) * q)
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                put(cx + dx, cy + dy, (0, 0, 0) if max(abs(dx), abs(dy)) == 5 else PALETTE[k])
    write_png(sys.argv[3], w, h, out)

hexes = {k: "#%02X%02X%02X" % v for k, v in PALETTE.items()}
rects = "".join(f'<rect x="{(c - c0) * PX:g}" y="{(r - r0) * PX:g}" width="{PX:g}" height="{PX:g}" fill="{hexes[k]}"/>'
                for (c, r), k in sorted(grid.items(), key=lambda t: (t[0][1], t[0][0])))
W, H = (c1 - c0 + 1) * PX, (r1 - r0 + 1) * PX
open(svg_out, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:g}" height="{H:g}" viewBox="0 0 {W:g} {H:g}" '
    f'shape-rendering="crispEdges"><title>Clawd with ram horns</title>{rects}</svg>\n')
