#!/usr/bin/env python3
"""
Strip unused properties from the Marseille streets GeoJSON.

Input:  data/marseille_rues_enrichi.geojson  (~228 Mo, 302 properties per feature)
Output: data/marseille_rues_light.geojson    (~5-10 Mo, only name/quartier/highway)

Also copies the light file into backend/data/ for Render.
"""

import json
import os
import shutil
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

INPUT_FILE = os.path.join(PROJECT_DIR, "data", "marseille_rues_enrichi.geojson")
OUTPUT_FILE = os.path.join(PROJECT_DIR, "data", "marseille_rues_light.geojson")
BACKEND_OUTPUT = os.path.join(PROJECT_DIR, "backend", "data", "marseille_rues_light.geojson")

# Only keep properties that the game actually uses
KEEP_PROPERTIES = {"name", "quartier", "highway"}

# Round coordinates to 5 decimal places (~1.1 m precision)
COORD_PRECISION = 5


def round_coords(coords):
    """Recursively round coordinate arrays."""
    if isinstance(coords, (int, float)):
        return round(coords, COORD_PRECISION)
    if isinstance(coords, list):
        return [round_coords(c) for c in coords]
    return coords


def strip_feature(feature):
    """Strip a single GeoJSON feature to only keep essential data."""
    props = feature.get("properties", {})
    stripped_props = {}
    for key in KEEP_PROPERTIES:
        if key in props and props[key] is not None:
            value = props[key]
            if isinstance(value, str):
                value = value.strip()
            if value:  # skip empty strings
                stripped_props[key] = value

    # Skip features without a name
    if "name" not in stripped_props or not stripped_props["name"]:
        return None

    geometry = feature.get("geometry", {})
    stripped_geometry = {
        "type": geometry.get("type"),
        "coordinates": round_coords(geometry.get("coordinates", []))
    }

    return {
        "type": "Feature",
        "properties": stripped_props,
        "geometry": stripped_geometry
    }


def main():
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Input file not found: {INPUT_FILE}")
        sys.exit(1)

    input_size = os.path.getsize(INPUT_FILE)
    print(f"📂 Reading {INPUT_FILE}")
    print(f"   Size: {input_size / 1_000_000:.1f} Mo")

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    print(f"   Features: {len(features)}")

    # Strip all features
    stripped_features = []
    skipped = 0
    for feat in features:
        result = strip_feature(feat)
        if result:
            stripped_features.append(result)
        else:
            skipped += 1

    print(f"   Kept: {len(stripped_features)}, Skipped (no name): {skipped}")

    # Build output GeoJSON
    output_data = {
        "type": "FeatureCollection",
        "features": stripped_features
    }

    # Write with minimal whitespace (compact JSON)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(",", ":"))

    output_size = os.path.getsize(OUTPUT_FILE)
    reduction = (1 - output_size / input_size) * 100

    print(f"\n✅ Output: {OUTPUT_FILE}")
    print(f"   Size: {output_size / 1_000_000:.1f} Mo")
    print(f"   Reduction: {reduction:.1f}%")

    # Copy to backend/data/
    os.makedirs(os.path.dirname(BACKEND_OUTPUT), exist_ok=True)
    shutil.copy2(OUTPUT_FILE, BACKEND_OUTPUT)
    print(f"   Copied to: {BACKEND_OUTPUT}")

    # Quick sanity check
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        check = json.load(f)
    sample = check["features"][0]
    print(f"\n🔍 Sample feature properties: {list(sample['properties'].keys())}")
    print(f"   Name: {sample['properties'].get('name')}")


if __name__ == "__main__":
    main()
