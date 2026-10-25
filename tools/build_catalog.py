"""Build the item catalog (internal ID -> display name, category, tier) from CUE4Parse JSON exports.

usage: python tools/build_catalog.py <client-export-dir> <categories-export-dir> <recipes.json> <out-items.json>

- Items come from CDT_BaseItems (a composite of the DT_BaseItems_* tables), whose FText names were
  resolved against the English locres at export time.
- Tier is the `LootTier.N` gameplay tag. `rarityTag` is the raw `Rarity.*` tag; it is not the rarity the UI
  shows (items the UI calls "Unique" carry `Rarity.Rare`), so it is kept raw rather than interpreted.
- Category is the in-game UI category (GUI/Data/ItemCategories) whose filter tag is the longest prefix of
  the item's `Items.*` type tag; the full path follows the SubCategories tree. Items without a type tag fall
  back to the top-level category most common among the items of the same source table (DT_BaseItems_*).
- Coverage is reported for the items used by active recipes (see dune_data.active_recipes).
"""
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dune_data import active_recipes, load_removals, load_rows, recipe_item_ids, text  # noqa: E402

FLAG_TAG_PREFIXES = ("Items.Exclude", "Items.Not", "Items.Hide")


def asset_stem(ref):
    path = (ref or {}).get("ObjectPath") or (ref or {}).get("AssetPathName") or ""
    return path.rsplit("/", 1)[-1].split(".", 1)[0] or None


def load_categories(directory):
    categories = {}
    for f in sorted(Path(directory).glob("*.json")):
        for export in json.loads(f.read_text(encoding="utf-8")):
            props = export.get("Properties") or {}
            if "DisplayName" in props:
                categories[f.stem] = {
                    "name": text(props["DisplayName"]),
                    "tags": [t["TagName"] for t in (props.get("ItemFilter") or {}).get("TagDictionary", [])],
                    "children": [asset_stem(c) for c in props.get("SubCategories") or []],
                }
    parents = {}
    for stem, cat in categories.items():
        for child in cat["children"]:
            parents.setdefault(child, stem)
    return categories, parents


def category_path(stem, categories, parents):
    path, seen = [], set()
    while stem and stem not in seen and stem in categories:
        seen.add(stem)
        if categories[stem]["name"] != "All":
            path.append(categories[stem]["name"])
        stem = parents.get(stem)
    return list(reversed(path))


def is_prefix(prefix, tag):
    return tag == prefix or tag.startswith(prefix + ".")


def classify(type_tags, categories):
    """Most specific UI category for an item: longest matching filter tag, then the narrowest category."""
    best = None
    for stem, cat in categories.items():
        for filter_tag in cat["tags"]:
            if not filter_tag.startswith("Items.") or filter_tag == "Items":
                continue
            if any(is_prefix(filter_tag, t) for t in type_tags):
                score = (filter_tag.count(".") + 1, -len(cat["tags"]))
                if best is None or score > best[0]:
                    best = (score, stem)
    return best[1] if best else None


def source_tables(export_dir):
    """Item ID -> name of the DT_BaseItems_* table it comes from (the composite does not keep this)."""
    composite = next(e for e in json.loads((Path(export_dir) / "CDT_BaseItems.json").read_text(encoding="utf-8")) if "Rows" in e)
    origin = {}
    for ref in composite["Properties"].get("ParentTables") or []:
        table = ref["ObjectName"].split("'")[1]
        path = Path(export_dir) / f"{table}.json"
        if path.exists():
            for item_id in load_rows(path):
                origin.setdefault(item_id, table)
    return origin


def main(export_dir, categories_dir, recipes_path, out_path):
    items = load_rows(Path(export_dir) / "CDT_BaseItems.json")
    categories, parents = load_categories(categories_dir)
    removed_items, _ = load_removals(export_dir)
    origin = source_tables(export_dir)

    catalog, stats = {}, Counter()
    for item_id, row in items.items():
        static = row.get("StaticData") or {}
        tags = static.get("ItemTags") or []
        type_tags = [t for t in tags if t.startswith("Items.") and not t.startswith(FLAG_TAG_PREFIXES)]
        tier = next((int(t.split(".")[1]) for t in tags if t.startswith("LootTier.") and t.split(".")[1].isdigit()), None)
        rarity_tag = next((t.split(".", 1)[1] for t in tags if t.startswith("Rarity.")), None)
        category = classify(type_tags, categories)
        catalog[item_id] = {
            "name": text(static.get("Name")),
            "category": category_path(category, categories, parents) if category else [],
            "typeTag": type_tags[0] if type_tags else None,
            "tier": tier,
            "rarityTag": rarity_tag,
            "icon": (row.get("Icon") or {}).get("AssetPathName") or None,
            "enabled": static.get("bIsEnabled", True) and not row.get("bIsDeprecated", False),
            "removed": item_id in removed_items,
            "sourceTable": origin.get(item_id),
        }

    top_by_table = {}
    for entry in catalog.values():
        if entry["category"] and entry["sourceTable"]:
            top_by_table.setdefault(entry["sourceTable"], Counter())[entry["category"][0]] += 1
    for entry in catalog.values():
        if not entry["category"] and entry["sourceTable"] in top_by_table:
            entry["category"] = [top_by_table[entry["sourceTable"]].most_common(1)[0][0]]
            entry["categoryIsFallback"] = True

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(catalog, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_path}: {len(catalog)} items, {len(categories)} UI categories")

    # Coverage is measured on what the calculator will actually show: items used by active recipes.
    recipes = load_rows(recipes_path)
    active = active_recipes(recipes, catalog, export_dir)
    used = Counter(i for row in active.values() for i in recipe_item_ids(row))
    for item_id in used:
        entry = catalog[item_id]
        stats["no name"] += entry["name"] is None
        stats["no category"] += not entry["category"]
        stats["no tier"] += entry["tier"] is None
        stats["disabled"] += not entry["enabled"]
    print(f"active recipes: {len(active)} of {len(recipes)}; items they use: {len(used)}")
    for key in ("no name", "no category", "no tier", "disabled"):
        print(f"  used items with {key}: {stats[key]}")
    return 0 if stats["no name"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:5]))
