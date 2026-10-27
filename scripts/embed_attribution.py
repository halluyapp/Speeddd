#!/usr/bin/env python3
"""Embed catalog attribution in each GLB without touching geometry or material chunks.

This script is idempotent and uses only the Python standard library. Run it after
changing credit records in public/assets/catalog.json.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public/assets/catalog.json"


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValueError(f"Not a valid glTF 2.0 binary: {path}")
    json_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise ValueError(f"Missing GLB JSON chunk: {path}")
    document = json.loads(data[20 : 20 + json_length])
    remaining = data[20 + json_length :]
    return document, remaining


def write_glb(path: Path, document: dict, remaining: bytes) -> None:
    json_chunk = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((-len(json_chunk)) % 4)
    total_length = 12 + 8 + len(json_chunk) + len(remaining)
    with path.open("wb") as output:
        output.write(struct.pack("<4sII", b"glTF", 2, total_length))
        output.write(struct.pack("<I4s", len(json_chunk), b"JSON"))
        output.write(json_chunk)
        output.write(remaining)


def main() -> None:
    catalog = json.loads(CATALOG.read_text())
    for car in catalog["cars"]:
        credit = car["credit"]
        path = ROOT / car.get("master", f"assets-src/cars/{car['id']}.glb")
        document, remaining = read_glb(path)
        asset = document.setdefault("asset", {})
        asset.setdefault("version", "2.0")
        attribution = (
            f"{credit['title']} — {credit['author']}; {credit['license']}; "
            f"{credit['source']}"
        )
        existing = asset.get("copyright", "")
        if attribution not in existing:
            asset["copyright"] = f"{existing} | {attribution}" if existing else attribution
        extras = asset.setdefault("extras", {})
        extras["velocityCollection"] = {
            "assetId": car["id"],
            "collection": catalog["collection"],
            "catalog": "assets/catalog.json",
            "license": credit["license"],
            "source": credit["source"],
            "note": "Master asset; run npm run build:cars after credit edits. Runtime normalization is baked by the build pipeline.",
        }
        write_glb(path, document, remaining)
        print(f"Embedded attribution: {path.name}")


if __name__ == "__main__":
    main()
