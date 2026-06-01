#!/usr/bin/env python3

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"


def clamp(value, low=0, high=255):
    return max(low, min(high, int(value)))


def inside_rounded_rect(x, y, width, height, radius):
    if radius <= x <= width - radius or radius <= y <= height - radius:
        return True

    corners = (
        (radius, radius),
        (width - radius, radius),
        (radius, height - radius),
        (width - radius, height - radius),
    )
    return any((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 for cx, cy in corners)


def draw_icon(size):
    width = height = size
    radius = size * 0.23
    pixels = bytearray()

    for y in range(height):
        pixels.append(0)
        for x in range(width):
            if not inside_rounded_rect(x, y, width - 1, height - 1, radius):
                pixels.extend((0, 0, 0, 0))
                continue

            mix = (x + y) / (width + height)
            r = 136 + (210 - 136) * mix
            g = 167 + (178 - 167) * mix
            b = 111 + (110 - 111) * mix

            cx = width / 2
            cy = height / 2 + size * 0.03
            face_r = size * 0.24
            dx = x - cx
            dy = y - cy

            if ((x - size * 0.3) ** 2) / (size * 0.08) ** 2 + ((y - size * 0.23) ** 2) / (size * 0.14) ** 2 <= 1:
                r, g, b = 93, 65, 32
            if ((x - size * 0.7) ** 2) / (size * 0.08) ** 2 + ((y - size * 0.23) ** 2) / (size * 0.14) ** 2 <= 1:
                r, g, b = 93, 65, 32

            if dx * dx + dy * dy <= face_r * face_r:
                r, g, b = 62, 46, 27

            if dx * dx + (dy + size * 0.03) ** 2 <= (face_r * 0.82) ** 2:
                r, g, b = 51, 37, 21

            if (x - size * 0.43) ** 2 + (y - size * 0.43) ** 2 <= (size * 0.022) ** 2:
                r, g, b = 242, 238, 230
            if (x - size * 0.57) ** 2 + (y - size * 0.43) ** 2 <= (size * 0.022) ** 2:
                r, g, b = 242, 238, 230

            muzzle = ((x - cx) ** 2) / (size * 0.16) ** 2 + ((y - size * 0.62) ** 2) / (size * 0.06) ** 2
            if muzzle <= 1:
                r = clamp(r + 24)
                g = clamp(g + 18)
                b = clamp(b + 14)

            pixels.extend((clamp(r), clamp(g), clamp(b), 255))

    return bytes(pixels)


def write_png(path: Path, width: int, height: int, rgba_rows: bytes):
    def chunk(name: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + name
            + data
            + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rgba_rows, level=9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    ICONS_DIR.mkdir(exist_ok=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
        rows = draw_icon(size)
        write_png(ICONS_DIR / name, size, size, rows)


if __name__ == "__main__":
    main()
