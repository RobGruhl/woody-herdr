#!/usr/bin/env python3
# Usage: python3 art/make-clawd-target.py clawd-target.png
#
# Clawd as gpt-image-2's edit target: Herdr's Claude Code icon at 32 px per pixel,
# low and centred on a flat #2A2A2A 1024 x 1024 canvas, with room above and beside
# the head for horns. RECIPE.md has the edit prompt.
import struct, sys, zlib
CLAWD = ["..OOOOOOOOOOOO..","..OOOOOOOOOOOO..","..OO.OOOOOO.OO..","..OO.OOOOOO.OO..",
         "OOOOOOOOOOOOOOOO","OOOOOOOOOOOOOOOO","..OOOOOOOOOOOO..","..OOOOOOOOOOOO..",
         "...O.O....O.O...","...O.O....O.O..."]
S, CELL, COL0, ROW0 = 1024, 32, 8, 14
BG, BODY = (0x2a, 0x2a, 0x2a), (0xd9, 0x77, 0x57)
rows = []
for y in range(S):
    r, line = (y // CELL) - ROW0, bytearray(b"\0")
    for x in range(S):
        c = (x // CELL) - COL0
        line += bytes(BODY if 0 <= r < 10 and 0 <= c < 16 and CLAWD[r][c] == "O" else BG)
    rows.append(bytes(line))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
open(sys.argv[1], "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))
