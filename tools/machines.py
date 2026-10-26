"""Machines a player builds (refineries, fabricators, windtraps, storage...) and what they cost to build.

The construction menu's "Placeables" category (DT_BuildableUiCategory) has subcategories
(DT_DuneBuildableUiSubcategory), each listing buildable groups. A machine (a DT_PlaceableData_Functional*
row) belongs to one group and one tier, and costs what its group's row in DT_BuildableGroupData_Placeable
lists for that tier (m_PlacementCosts). Machines need no station: the calculator models building as a
recipe made with the Construction Tool (BUILD_STATION) that takes no time.
"""
from pathlib import Path

from dune_data import load_removals, load_rows, text

MENU_CATEGORY = "Placeables"
BUILD_STATION = "ConstructionTool"
BUILD_TOOL_ITEM = "BasicBuildingTool"  # the Construction Tool item, which names the station and gives its icon
# Listed among the machines by the game, but they are shielded wall and ceiling pieces.
LEFT_OUT_GROUPS = {"PentashieldSurfaceHorizontal", "PentashieldSurfaceVertical"}


def load_placeables(export_dir):
    """Functional placeable rows, from DT_PlaceableData_Functional and its patch tables (_1510, ...)."""
    rows = {}
    for path in sorted(Path(export_dir).glob("DT_PlaceableData_Functional*.json")):
        rows.update(load_rows(path))
    return rows


def menu_names(export_dir):
    """Display names of the construction menu's machine category and of its subcategories, by row key."""
    category = load_rows(Path(export_dir) / "DT_BuildableUiCategory.json")[MENU_CATEGORY]
    subcategories = load_rows(Path(export_dir) / "DT_DuneBuildableUiSubcategory.json")
    keys = [s["Name"] for s in category["m_Subcategories"]]
    return text(category["m_DisplayName"]), {key: text(subcategories[key]["m_DisplayName"]) for key in keys}


def placement_costs(group_row, tier):
    for entry in (group_row or {}).get("m_BuildableTierData") or []:
        if entry["Key"]["Name"] == tier:
            return {cost["Key"]["Name"]: cost["Value"] for cost in entry["Value"]["m_PlacementCosts"]}
    return {}


def machines(export_dir, catalog):
    """Machine ID -> {name, category, icon, cost}, for the machines a player can build.

    Left out: debug rows (named "XX_..."), developer tools, rows hidden from the menu, groups outside the
    menu's machine subcategories (doors, the portable fabricator), and machines whose cost is empty or
    references an item that is not in the catalog, disabled or cut (as for recipes).
    """
    removed_items, _ = load_removals(export_dir)
    menu, subcategory_names = menu_names(export_dir)
    subcategories = load_rows(Path(export_dir) / "DT_DuneBuildableUiSubcategory.json")
    subcategory_of = {group["Name"]: key for key in subcategory_names for group in subcategories[key]["m_Buildables"]}
    groups = load_rows(Path(export_dir) / "DT_BuildableGroupData_Placeable.json")

    out = {}
    for machine_id, row in sorted(load_placeables(export_dir).items()):
        group = row["m_BuildableGroupType"]["Name"]
        name = text(row.get("m_DisplayName"))
        if (row.get("m_bShowInList") is False or group not in subcategory_of or group in LEFT_OUT_GROUPS
                or not name or name.startswith("XX_") or machine_id.startswith("Developer_")):
            continue
        cost = placement_costs(groups.get(group), row["m_BuildableTier"]["Name"])
        if not cost or any(i not in catalog or i in removed_items or not catalog[i]["enabled"] for i in cost):
            continue
        out[machine_id] = {
            "name": name,
            "category": [menu, subcategory_names[subcategory_of[group]]],
            "icon": (row.get("m_BuildableIcon") or {}).get("AssetPathName") or None,
            "cost": cost,
        }
    return out
