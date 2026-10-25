"""Helpers shared by the data tools: reading CUE4Parse JSON exports and deciding which recipes are live."""
import json
from pathlib import Path

PLACEHOLDER_PREFIX = "PH_"  # Funcom's marker for unreleased station names ("PH_Polar Fabricator")


def load_rows(path):
    return next(e for e in json.loads(Path(path).read_text(encoding="utf-8")) if "Rows" in e)["Rows"]


def text(ftext):
    return (ftext or {}).get("LocalizedString") or (ftext or {}).get("SourceString")


def load_removals(export_dir):
    """Funcom's cut-content list (DA_ItemsAndRecipesToRemove): (item IDs, recipe IDs)."""
    exports = json.loads((Path(export_dir) / "DA_ItemsAndRecipesToRemove.json").read_text(encoding="utf-8"))
    props = next(e for e in exports if e.get("Properties"))["Properties"]
    names = lambda key: {v["Name"] if isinstance(v, dict) else v for v in props.get(key) or []}
    return names("m_ItemsToRemove"), names("m_RecipesToRemove")


def load_station_names(export_dir):
    """Production type ID -> display name (DT_CraftingProductionTypes)."""
    return {sid: text(row.get("Name")) for sid, row in load_rows(Path(export_dir) / "DT_CraftingProductionTypes.json").items()}


def load_station_icons(export_dir):
    """Production type ID -> icon texture path (DT_CraftingProductionTypes), when it has one."""
    rows = load_rows(Path(export_dir) / "DT_CraftingProductionTypes.json")
    return {sid: (row.get("Icon") or {}).get("AssetPathName") or None for sid, row in rows.items()}


def recipe_item_ids(row):
    recipe = row["Recipe"]
    ids = [pair["Key"]["Name"] for pair in recipe.get("Outcome") or []]
    for quality in recipe.get("IngredientsPerQuality") or []:
        ids += [pair["Key"]["Name"] for pair in quality.get("Ingredients") or []]
    return ids


def active_recipes(recipes, catalog, export_dir):
    """Recipes a player can actually use.

    A recipe is active when it is not on the cut-content list, produces something, can be made at at least
    one released station, and every item it references is in the catalog, enabled and not cut.
    """
    removed_items, removed_recipes = load_removals(export_dir)
    stations = load_station_names(export_dir)
    active = {}
    for recipe_id, row in recipes.items():
        recipe = row["Recipe"]
        if recipe_id in removed_recipes:
            continue
        if not (recipe.get("Outcome") or recipe.get("WaterOutcome")):
            continue
        released = [s["Name"] for s in row.get("RequiredProductionTypes") or []
                    if s["Name"] in stations and not (stations[s["Name"]] or "").startswith(PLACEHOLDER_PREFIX)]
        if not released:
            continue
        if any(i not in catalog or i in removed_items or not catalog[i]["enabled"] for i in recipe_item_ids(row)):
            continue
        active[recipe_id] = row
    return active
