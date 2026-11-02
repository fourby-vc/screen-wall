#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Draws the toolbar/store icons (a 2×2 grid of screens, the one with sound lit) into icons/. No dependencies.

    python3 dev/make-icons.py
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (16, 19, 24)
TILE = (245, 184, 61)     # amber: the screen with sound
TILE_DIM = (78, 86, 101)  # neutral: the other screens


def rounded(x, y, x0, y0, x1, y1, r):
    """True if pixel centre (x, y) is inside the rounded rect."""
    cx, cy = x + 0.5, y + 0.5
    if not (x0 <= cx <= x1 and y0 <= cy <= y1):
        return False
    nx = min(max(cx, x0 + r), x1 - r)
    ny = min(max(cy, y0 + r), y1 - r)
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r


def draw(size):
    rows = []
    pad = size * 0.06
    gap = max(1.0, size * 0.07)
    inner0, inner1 = size * 0.2, size * 0.8
    half = (inner1 - inner0 - gap) / 2
    tiles = [
        (inner0, inner0, inner0 + half, inner0 + half, TILE),
        (inner0 + half + gap, inner0, inner1, inner0 + half, TILE_DIM),
        (inner0, inner0 + half + gap, inner0 + half, inner1, TILE_DIM),
        (inner0 + half + gap, inner0 + half + gap, inner1, inner1, TILE_DIM),
    ]
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px = (0, 0, 0, 0)
            if rounded(x, y, pad, pad, size - pad, size - pad, size * 0.22):
                px = BG + (255,)
                for x0, y0, x1, y1, color in tiles:
                    if rounded(x, y, x0, y0, x1, y1, max(0.6, size * 0.05)):
                        px = color + (255,)
            row.extend(px)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
    for s in (16, 32, 48, 128):
        with open(os.path.join(ROOT, "icons", f"{s}.png"), "wb") as f:
            f.write(draw(s))
    print("icons written")
