#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ICON_DIR="$ROOT_DIR/apps/extension/public"
mkdir -p "$ICON_DIR"

# Generate simple valid PNG icons without adding an image dependency. The same
# deterministic icon is used at all required manifest sizes; Safari's packager
# requires icon files to be present even for a development build.
python3 - "$ICON_DIR" <<'PY'
import struct, sys, zlib
from pathlib import Path

out = Path(sys.argv[1])

def png(path, size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # Dark blue rounded-ish square with a white J mark.
            edge = min(x, y, size - 1 - x, size - 1 - y)
            bg = (18, 55, 92, 255) if edge >= max(1, size // 16) else (255, 255, 255, 255)
            cx, cy = size * 0.5, size * 0.48
            r = size * 0.11
            white = abs(x - cx) < r and y > size * 0.22 and y < size * 0.70
            white = white or (x > size * 0.38 and x < size * 0.62 and y > size * 0.60 and y < size * 0.78)
            white = white or ((x - size * 0.50) ** 2 + (y - size * 0.78) ** 2 < (size * 0.13) ** 2)
            row.extend((255, 255, 255, 255) if white else bg)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)

for n in (16, 32, 48, 128):
    png(out / f"icon-{n}.png", n)
PY
