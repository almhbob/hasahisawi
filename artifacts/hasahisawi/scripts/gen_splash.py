#!/usr/bin/env python3
"""Generate iOS splash screens as PNG files using pure Python (no Pillow)."""
import struct, zlib, os, math

OUT = os.path.join(os.path.dirname(__file__), "../public/splash")
os.makedirs(OUT, exist_ok=True)

def png_chunk(name, data):
    c = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", c)

def make_png(w, h, pixels):
    """pixels: list of (r,g,b) tuples, row by row"""
    raw = b""
    for y in range(h):
        row = b"\x00"  # filter type None
        for x in range(w):
            r, g, b = pixels[y * w + x]
            row += struct.pack("BBB", r, g, b)
        raw += row
    compressed = zlib.compress(raw, 6)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )

def lerp(a, b, t):
    return int(a + (b - a) * t)

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

SIZES = [
    (1170, 2532, "splash-1170x2532.png"),  # iPhone 15/14/13
    (750,  1334, "splash-750x1334.png"),   # iPhone SE
    (1290, 2796, "splash-1290x2796.png"),  # iPhone 15 Plus
]

for w, h, fname in SIZES:
    print(f"Generating {fname} ({w}×{h})…")
    pixels = []
    cx, cy = w // 2, h // 2 - h // 20
    icon_r = min(w, h) // 6

    for y in range(h):
        for x in range(w):
            # Background gradient #0D1A0D → #0D0D0D
            t = y / h
            bg_r = lerp(13, 13, t)
            bg_g = lerp(26, 13, t)
            bg_b = lerp(13, 13, t)

            # Green glow around icon center
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            glow_r_val = icon_r * 2.8
            if dist < glow_r_val:
                gf = max(0.0, 1.0 - dist / glow_r_val)
                gf = gf ** 2
                bg_r = clamp(bg_r + int(34 * gf * 0.25))
                bg_g = clamp(bg_g + int(197 * gf * 0.25))
                bg_b = clamp(bg_b + int(94 * gf * 0.25))

            # Icon circle fill
            if dist < icon_r:
                bg_r, bg_g, bg_b = 26, 46, 26

            # Icon circle border (green ring)
            ring_w = max(3, icon_r // 16)
            if icon_r - ring_w <= dist <= icon_r:
                bg_r, bg_g, bg_b = 34, 197, 94

            pixels.append((clamp(bg_r), clamp(bg_g), clamp(bg_b)))

    data = make_png(w, h, pixels)
    with open(os.path.join(OUT, fname), "wb") as f:
        f.write(data)
    print(f"  ✓ saved ({len(data)//1024} KB)")

print("Done.")
