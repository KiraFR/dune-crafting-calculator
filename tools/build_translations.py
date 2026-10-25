"""Build a translation file for the calculator: names of the items, UI categories and stations of
data/site-data.json in another language, from a CUE4Parse export made with RECIPE_EXPORT_LANGUAGE set.

usage: python tools/build_translations.py <lang-export-dir> <en-categories-dir> <lang-categories-dir>
           <site-data.json> <out.json> [--water Eau]

- Item names come from CDT_BaseItems, station names from DT_CraftingProductionTypes, as in the English
  pipeline. Water is the calculator's pseudo-item and has no game name: pass its translation with --water.
- Categories are translated name by name: each category asset (same file stem in both exports) gives the
  English -> translated pair, and every path in site-data.json is mapped element-wise, fallbacks included.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_catalog import load_categories  # noqa: E402
from dune_data import load_rows, load_station_names, text  # noqa: E402


def category_names(en_dir, lang_dir):
    """English category name -> translated name, paired through the category asset they come from."""
    en, _ = load_categories(en_dir)
    lang, _ = load_categories(lang_dir)
    pairs = {}
    for stem, category in en.items():
        if stem in lang and lang[stem]["name"]:
            pairs.setdefault(category["name"], lang[stem]["name"])
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export_dir")
    parser.add_argument("en_categories")
    parser.add_argument("lang_categories")
    parser.add_argument("site_data")
    parser.add_argument("out")
    parser.add_argument("--water", default="Water")
    args = parser.parse_args()

    site = json.loads(Path(args.site_data).read_text(encoding="utf-8"))
    rows = load_rows(Path(args.export_dir) / "CDT_BaseItems.json")
    stations = load_station_names(args.export_dir)
    pairs = category_names(args.en_categories, args.lang_categories)

    items, missing = {}, []
    for item_id in site["items"]:
        if item_id == "Water":
            items[item_id] = args.water
            continue
        name = text(((rows.get(item_id) or {}).get("StaticData") or {}).get("Name"))
        if name:
            items[item_id] = name
        else:
            missing.append(item_id)

    untranslated = sorted({n for path in site["categories"] for n in path if n not in pairs})
    out = {
        "items": items,
        "categories": [[pairs.get(n, n) for n in path] for path in site["categories"]],
        "stations": {sid: stations.get(sid) or name for sid, name in site["stations"].items()},
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {args.out}: {len(items)} items, {len(out['categories'])} categories, {len(out['stations'])} stations")
    print(f"  items without a translated name (kept in English by the site): {len(missing)} {missing[:8]}")
    print(f"  category names without a translation: {len(untranslated)} {untranslated[:8]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
