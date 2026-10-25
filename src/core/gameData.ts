// Typed view of data/site-data.json (format: tools/README.md, "Site data format").

export interface RawItem {
  n: string;
  c?: number;
  t?: number | null;
  i?: string;
  /** 1 when the game shows the item as "Unique". */
  u?: 1;
}

export interface RawRecipe {
  s: string[];
  d: number;
  o: Record<string, number>;
  q: Record<string, number>[];
}

export interface DataSource {
  game: string;
  clientBuild: string;
  serverBuild: string;
  generated: string;
}

export interface RawSiteData {
  schema: number;
  source: DataSource;
  stations: Record<string, string>;
  /** Station ID -> icon texture path, like items' `i`. */
  stationIcons?: Record<string, string>;
  categories: string[][];
  items: Record<string, RawItem>;
  recipes: Record<string, RawRecipe>;
}

/** Names of site-data.json in another language (data/names.<lang>.json, tools/build_translations.py). */
export interface Translation {
  items: Record<string, string>;
  /** Category paths, at the same indexes as RawSiteData.categories. */
  categories: string[][];
  stations: Record<string, string>;
}

export interface Item {
  id: string;
  name: string;
  /** UI category path, e.g. ["Misc", "Refined Resources"]; absent for Water. */
  category?: string[];
  tier?: number;
  /** Icon texture path, relative to /Game/Dune/GUI/Textures/Icons/Gameplay/ or absolute for DLC items. */
  icon?: string;
  /** The game shows the item as "Unique" (Rarity.Rare tag). */
  unique: boolean;
  /** IDs of the recipes that output this item, sorted. Empty for raw materials. */
  producers: string[];
}

export interface Recipe {
  id: string;
  /** Stations that can craft it (any of). */
  stations: string[];
  /** Seconds per craft. */
  duration: number;
  outputs: Record<string, number>;
  /** Ingredients per quality level; index 0 is the base recipe. */
  levels: Record<string, number>[];
}

export interface GameData {
  source: DataSource;
  stations: Record<string, string>;
  stationIcons: Record<string, string>;
  categories: string[][];
  items: Record<string, Item>;
  recipes: Record<string, Recipe>;
}

export const SUPPORTED_SCHEMA = 1;

export function indexGameData(raw: RawSiteData): GameData {
  if (raw.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`site-data.json schema ${raw.schema} is not supported (expected ${SUPPORTED_SCHEMA})`);
  }

  const items: Record<string, Item> = {};
  for (const [id, it] of Object.entries(raw.items)) {
    items[id] = {
      id,
      name: it.n,
      category: it.c === undefined ? undefined : raw.categories[it.c],
      tier: it.t ?? undefined,
      icon: it.i,
      unique: it.u === 1,
      producers: [],
    };
  }

  const recipes: Record<string, Recipe> = {};
  for (const id of Object.keys(raw.recipes).sort()) {
    const r = raw.recipes[id]!;
    recipes[id] = { id, stations: r.s, duration: r.d, outputs: r.o, levels: r.q };
    for (const out of Object.keys(r.o)) {
      const item = items[out];
      if (!item) throw new Error(`recipe ${id} outputs unknown item ${out}`);
      item.producers.push(id);
    }
  }

  return {
    source: raw.source,
    stations: raw.stations,
    stationIcons: raw.stationIcons ?? {},
    categories: raw.categories,
    items,
    recipes,
  };
}

/** Ingredients of `recipe` at a quality level, clamped to the levels the recipe has. */
export function ingredientsAt(recipe: Recipe, quality: number): Record<string, number> {
  const last = recipe.levels.length - 1;
  const index = Math.min(Math.max(0, Math.floor(quality) || 0), last);
  return recipe.levels[index]!;
}

/** File name of an exported icon (texture names are unique), from an item's or a station's icon path. */
export function iconFile(icon: string | undefined): string | undefined {
  return icon && `${icon.slice(icon.lastIndexOf('/') + 1)}.webp`;
}
