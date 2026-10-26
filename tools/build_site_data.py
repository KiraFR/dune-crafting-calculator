"""Build the calculator's data file: active recipes plus the items they use, in a compact JSON.

usage: python tools/build_site_data.py <client-export-dir> <items.json> <out.json>
           [--client-manifest appmanifest_1172710.acf] [--server-manifest appmanifest_4754530.acf]

The format is documented in tools/README.md ("Site data format"). Water is modelled as the pseudo-item
`Water`, since recipes both consume it (refineries) and produce it. Machines (tools/machines.py) are items
too, each with a recipe for its construction cost.
"""
import argparse
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dune_data import active_recipes, load_rows, load_station_icons, load_station_names, recipe_item_ids  # noqa: E402
from machines import BUILD_STATION, BUILD_TOOL_ITEM, machines  # noqa: E402

SCHEMA = 1
WATER = "Water"
ICON_PREFIX = "/Game/Dune/GUI/Textures/Icons/Gameplay/"


def steam_build(manifest):
    if not manifest or not Path(manifest).exists():
        return None
    match = re.search(r'"buildid"\s+"(\d+)"', Path(manifest).read_text(encoding="utf-8", errors="replace"))
    return match.group(1) if match else None


def compact_icon(path):
    """'/Game/.../Items/Resources/T_X_D.T_X_D' -> 'Items/Resources/T_X_D'."""
    if not path:
        return None
    path = path.split(".", 1)[0]
    return path[len(ICON_PREFIX):] if path.startswith(ICON_PREFIX) else path


def number(value):
    return int(value) if float(value).is_integer() else round(value, 3)


def build(export_dir, catalog):
    recipes = active_recipes(load_rows(Path(export_dir) / "DT_ItemsCraftingRecipes.json"), catalog, export_dir)
    station_names = load_station_names(export_dir)

    out_recipes, used_items, used_stations = {}, set(), set()
    for recipe_id, row in sorted(recipes.items()):
        recipe = row["Recipe"]
        outputs = {p["Key"]["Name"]: p["Value"]["Amount"] for p in recipe.get("Outcome") or []}
        if recipe.get("WaterOutcome"):
            outputs[WATER] = recipe["WaterOutcome"]
        levels = []
        for quality in recipe.get("IngredientsPerQuality") or []:
            inputs = {p["Key"]["Name"]: p["Value"]["Amount"] for p in quality.get("Ingredients") or []}
            if quality.get("m_WaterIngredientAmount"):
                inputs[WATER] = quality["m_WaterIngredientAmount"]
            levels.append(inputs)
        stations = sorted(s["Name"] for s in row["RequiredProductionTypes"] if s["Name"] in station_names)
        out_recipes[recipe_id] = {"s": stations, "d": number(recipe["CraftingTimeInSec"]), "o": outputs, "q": levels}
        used_items.update(outputs)
        used_items.update(i for level in levels for i in level)
        used_stations.update(stations)

    # Machines are not in the item catalog: they get catalog-like entries of their own.
    built = {}
    for machine_id, machine in machines(export_dir, catalog).items():
        out_recipes[f"{machine_id}_Build"] = {"s": [BUILD_STATION], "d": 0, "o": {machine_id: 1}, "q": [machine["cost"]]}
        built[machine_id] = {"name": machine["name"], "category": machine["category"], "tier": None, "icon": machine["icon"]}
        used_items.add(machine_id)
        used_items.update(machine["cost"])
    if built:
        used_stations.add(BUILD_STATION)
        station_names[BUILD_STATION] = catalog[BUILD_TOOL_ITEM]["name"]

    categories, category_index, out_items = [], {}, {}
    for item_id in sorted(used_items):
        if item_id == WATER:
            out_items[item_id] = {"n": "Water"}
            continue
        entry = catalog.get(item_id) or built[item_id]
        key = tuple(entry["category"])
        if key not in category_index:
            category_index[key] = len(categories)
            categories.append(list(key))
        item = {"n": entry["name"], "c": category_index[key]}
        if entry["tier"] is not None:
            item["t"] = entry["tier"]
        if icon := compact_icon(entry["icon"]):
            item["i"] = icon
        # The in-game "Unique" rarity is the Rarity.Rare tag (see build_catalog.py).
        if entry.get("rarityTag") == "Rare":
            item["u"] = 1
        out_items[item_id] = item

    stations = {sid: station_names[sid] for sid in sorted(used_stations)}
    icons = load_station_icons(export_dir) | {BUILD_STATION: catalog[BUILD_TOOL_ITEM]["icon"]}
    station_icons = {sid: compact_icon(icons.get(sid)) for sid in sorted(used_stations) if icons.get(sid)}
    return out_recipes, out_items, categories, stations, station_icons


def find_cycles(recipes):
    """Items that can (indirectly) be needed to craft themselves, following quality level 0."""
    graph = defaultdict(set)
    for r in recipes.values():
        for out in r["o"]:
            graph[out].update(r["q"][0] if r["q"] else {})
    state, cyclic = {}, set()

    def visit(node, stack):
        state[node] = 1
        stack.append(node)
        for nxt in graph.get(node, ()):
            if state.get(nxt) == 1:
                cyclic.update(stack[stack.index(nxt):])
            elif nxt not in state:
                visit(nxt, stack)
        stack.pop()
        state[node] = 2

    sys.setrecursionlimit(10000)
    for node in list(graph):
        if node not in state:
            visit(node, [])
    return cyclic


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export_dir")
    parser.add_argument("catalog")
    parser.add_argument("out")
    parser.add_argument("--client-manifest")
    parser.add_argument("--server-manifest")
    args = parser.parse_args()

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    recipes, items, categories, stations, station_icons = build(args.export_dir, catalog)
    data = {
        "schema": SCHEMA,
        "source": {
            "game": "Dune: Awakening",
            "clientBuild": steam_build(args.client_manifest),
            "serverBuild": steam_build(args.server_manifest),
            "generated": date.today().isoformat(),
        },
        "stations": stations,
        "stationIcons": station_icons,
        "categories": categories,
        "items": items,
        "recipes": recipes,
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_bytes(raw)
    print(f"wrote {args.out}: {len(recipes)} recipes, {len(items)} items, {len(stations)} stations, "
          f"{len(categories)} categories; {len(raw) // 1024} KB ({len(gzip.compress(raw)) // 1024} KB gzipped)")

    # Sanity checks the calculator relies on.
    produced = Counter(out for r in recipes.values() for out in r["o"])
    consumed = {i for r in recipes.values() for level in r["q"] for i in level}
    problems = Counter()
    for r in recipes.values():
        problems["recipes without outputs"] += not r["o"]
        problems["recipes without station"] += not r["s"]
        problems["recipes without ingredients"] += not any(r["q"])
    for i in items:
        problems["items with no name"] += not items[i]["n"]
    raw_materials = sorted(consumed - set(produced))
    alternatives = sum(1 for n in produced.values() if n > 1)
    cyclic = find_cycles(recipes)
    print(f"  raw materials (consumed, never produced): {len(raw_materials)} e.g. {raw_materials[:8]}")
    print(f"  items with several recipes: {alternatives}")
    print(f"  items in crafting cycles: {len(cyclic)} {sorted(cyclic)[:10]}")
    for key, value in sorted(problems.items()):
        print(f"  {key}: {value}")
    return 1 if problems["items with no name"] or problems["recipes without outputs"] else 0


if __name__ == "__main__":
    sys.exit(main())
