"""Draw the app icon (a spice-ochre sun on a desert-night tile) and write the PNG and ICO files Tauri needs.

usage: python scripts/make_icons.py   (writes icons/ next to this folder; standard library only)
"""
import struct
import zlib
from pathlib import Path

NIGHT = (0x14, 0x11, 0x0E)
SPICE = (0xE0, 0xA2, 0x4E)
SAMPLES = 4  # supersampling per axis, for smooth edges


def coverage(x, y, size):
    """(alpha, colour) of one sample: a rounded tile, a ring and a centre dot, in a unit square."""
    u, v = x / size, y / size
    r = 0.22  # tile corner radius
    dx = max(abs(u - 0.5) - (0.5 - r), 0)
    dy = max(abs(v - 0.5) - (0.5 - r), 0)
    if dx * dx + dy * dy > r * r:
        return 0, NIGHT
    d = ((u - 0.5) ** 2 + (v - 0.5) ** 2) ** 0.5
    if d < 0.13 or 0.25 < d < 0.33:
        return 255, SPICE
    return 255, NIGHT


def render(size):
    rows = []
    n = SAMPLES * SAMPLES
    for py in range(size):
        row = bytearray([0])  # PNG filter type: none
        for px in range(size):
            a_sum = r_sum = g_sum = b_sum = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    a, (r, g, b) = coverage(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES, size)
                    a_sum += a
                    r_sum += r * a
                    g_sum += g * a
                    b_sum += b * a
            alpha = a_sum // n
            if a_sum:
                row += bytes((r_sum // a_sum, g_sum // a_sum, b_sum // a_sum, alpha))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size, raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def ico(images):
    """An ICO whose entries are PNG images (supported since Windows Vista)."""
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return head + entries + blobs


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    rendered = {size: render(size) for size in (16, 32, 48, 128, 256)}
    (out / "32x32.png").write_bytes(rendered[32])
    (out / "128x128.png").write_bytes(rendered[128])
    (out / "icon.png").write_bytes(rendered[256])
    (out / "icon.ico").write_bytes(ico([(s, rendered[s]) for s in (16, 32, 48, 256)]))
    print("wrote", ", ".join(sorted(p.name for p in out.iterdir())))


if __name__ == "__main__":
    main()
