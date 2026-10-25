# Data extraction tools

Recipe data comes from the game's own files. Funcom ships a Linux dedicated server
(Steam app 4754530, depot 4754532) that downloads anonymously and has no anti-cheat; its binary
carries the engine's reflection tables, which `usmap_gen` turns into `.usmap` mappings.

## Pipeline (re-run after each game patch)

1. Download the Linux server depot (about 4.8 GB):

   ```
   steamcmd +@sSteamCmdForcePlatformType linux +force_install_dir <data-dir>\server-linux +login anonymous +app_update 4754530 validate +quit
   ```

2. Extract `DuneSandboxServer-Linux-Shipping` and the `pakchunk*-LinuxServer` / `global` containers
   from `images/battlegroup/server.tar` (a docker image; the server lives in its largest layers).

3. Generate the mappings and the map key/value struct table:

   ```
   python tools/usmap_gen <server-binary> DuneAwakening-server.usmap --map-struct-types DuneAwakening-server.mapstructs.json
   ```

4. Export DataTables to JSON (needs the .NET 10 SDK and an `oo2core_9_win64.dll`, e.g. from an
   Unreal Engine install):

   ```
   dotnet run --project tools/recipe_export -c Release -- <paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> DT_ItemsCraftingRecipes <out-dir> DuneAwakening-server.mapstructs.json
   ```

5. Export the item tables and UI categories from the client paks with English names (client and server
   are the same build, so the server mappings apply), then build the catalog:

   ```
   set RECIPE_EXPORT_LANGUAGE=English
   dotnet run --project tools/recipe_export -c Release -- <client-paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> "Systems/Items/|DT_ItemsCraftingRecipes" <client-export-dir> DuneAwakening-server.mapstructs.json
   dotnet run --project tools/recipe_export -c Release -- <client-paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> GUI/Data/ItemCategories/ <client-export-dir>/categories DuneAwakening-server.mapstructs.json
   python tools/build_catalog.py <client-export-dir> <client-export-dir>/categories <client-export-dir>/DT_ItemsCraftingRecipes.json items.json
   ```

   `items.json` maps each internal ID to `name`, `category` (UI path), `typeTag`, `tier`, `rarityTag`,
   `icon`, `enabled`, `removed` and `sourceTable`.

6. Build the calculator's data file (export `Systems/Crafting/DT_CraftingProduction` too, for station
   names):

   ```
   python tools/build_site_data.py <client-export-dir> items.json data/site-data.json --client-manifest <steam>/steamapps/appmanifest_1172710.acf --server-manifest <server-linux>/steamapps/appmanifest_4754530.acf
   ```

7. Export the item and station icons referenced by the data file, as 64px WebP files in `public/icons/` (the
   site serves them at `/icons/<texture name>.webp`):

   ```
   dotnet run --project tools/recipe_export -c Release -- icons <client-paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> data/site-data.json public/icons 64
   ```

   The icons are BC7 textures, decoded by CUE4Parse-Conversion's managed decoder (no native Detex DLL needed).
   Each icon is cropped to its visible content before resizing, so it fills its tile at list size.

8. Build the French names (items, UI categories, stations) as `data/names.fr.json`: export the item table,
   the station names and the categories again with `RECIPE_EXPORT_LANGUAGE=French`, then translate:

   ```
   set RECIPE_EXPORT_LANGUAGE=French
   dotnet run --project tools/recipe_export -c Release -- <client-paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> "CDT_BaseItems|DT_CraftingProductionTypes" <fr-export-dir> DuneAwakening-server.mapstructs.json
   dotnet run --project tools/recipe_export -c Release -- <client-paks-dir> DuneAwakening-server.usmap <oo2core_9_win64.dll> GUI/Data/ItemCategories/ <fr-export-dir>/categories DuneAwakening-server.mapstructs.json
   python tools/build_translations.py <fr-export-dir> <client-export-dir>/categories <fr-export-dir>/categories data/site-data.json data/names.fr.json --water Eau
   ```

   Category names are paired through the category asset they come from, so every English path element has
   its French counterpart. The script reports any item or category left untranslated (the site then shows
   the English name).

## Active recipes

`dune_data.active_recipes` keeps a recipe when it is not on Funcom's cut-content list
(`DA_ItemsAndRecipesToRemove`), produces something, can be made at one released station (station names
starting with `PH_` are placeholders) and every item it references is in the catalog, enabled and not cut.

## Site data format

`data/site-data.json` (schema 1) is minified JSON with short keys:

```jsonc
{
  "schema": 1,
  "source": { "game": "Dune: Awakening", "clientBuild": "26083551", "serverBuild": "26081962", "generated": "2026-10-25" },
  "stations": { "MediumOreRefinery": "Medium Ore Refinery" },        // station ID -> display name
  "stationIcons": { "MediumOreRefinery": "Placeables/T_UI_IconPlacChoamOreRefinery01I_D" },  // station ID -> icon
  "categories": [["Misc", "Refined Resources"]],                    // UI category paths, referenced by index
  "items": {
    "SteelBar": { "n": "Steel Ingot", "c": 0, "t": 3, "i": "Items/Resources/T_UI_IconResourceSteelBar_D" },
    "Assassin_Light06_Unique_Helmet": { "n": "Phantom Whisper Helm", "c": 3, "t": 6, "i": "...", "u": 1 },
    "Water": { "n": "Water" }                                       // pseudo-item: recipes consume and produce water
  },
  "recipes": {
    "MediumSteelRecipe": {
      "s": ["MediumOreRefinery"],                                   // stations, any of
      "d": 4,                                                       // duration in seconds
      "o": { "SteelBar": 1 },                                       // outputs
      "q": [{ "DolomiteRock": 3, "IronBar": 1, "Water": 50 }]       // ingredients per quality level, index 0 = base
    }
  }
}
```

- `n` name, `c` category index, `t` tier (absent when the game has none), `i` icon path relative to
  `/Game/Dune/GUI/Textures/Icons/Gameplay/`, or an absolute `/Game/DLC/...` path for DLC items. Texture
  names are unique, so the exported icons sit flat in `public/icons/`. `u` is `1` for items the game
  shows as "Unique" (their `Rarity.Rare` tag; absent otherwise).
- `stationIcons` comes from the `Icon` of each `DT_CraftingProductionTypes` row, in the same path form as
  `i`. The game reuses one picture for some sizes (medium and large ore refineries, for one).
- An item can have several recipes (refinery sizes); an item no recipe produces is a raw material.
  The graph has no cycles at quality level 0.
- The file contains Funcom's game data; keep that in mind before making the repository public.

## Notes

- `usmap_gen` reads `UECodeGen_Private::F{Struct,Enum,Class}Params` through the binary's
  `R_X86_64_RELATIVE` relocations; layouts are documented in `reflection.py` and were checked
  against UE 5.2 (Funcom fork).
- DataTable rows are cooked with tagged properties, which do not record the struct type of map
  keys and values. Without `mapstructs.json`, CUE4Parse silently returns `null` for those maps.
- Debug switches for `recipe_export`: `RECIPE_EXPORT_VERBOSE=1` (CUE4Parse logs),
  `RECIPE_EXPORT_DEBUG_ROW=<row>` (property tree of one row), `RECIPE_EXPORT_SAVE_RAW=1`
  (raw package bytes).
