// Which recipe makes an item when several exist. The 14 items with alternatives
// differ by refinery size (Small/Medium/Large) within one kind of refinery
// (ore, chemical, spice): bigger machines use less input. The player picks the
// machine they use for each kind, once for every item.

import type { GameData } from './gameData';

export type StationSize = 'small' | 'medium' | 'large';

export const STATION_SIZES: readonly StationSize[] = ['small', 'medium', 'large'];

export const DEFAULT_SIZE: StationSize = 'medium';

const RANK: Record<StationSize, number> = { small: 1, medium: 2, large: 3 };

/** Size class of a station, or undefined for stations that come in one size (fabricators). */
export function stationSize(stationId: string): StationSize | undefined {
  if (stationId.startsWith('Small')) return 'small';
  if (stationId.startsWith('Medium')) return 'medium';
  if (stationId.startsWith('Large')) return 'large';
  // The first spice refinery has no size prefix.
  if (stationId === 'SpiceRefinery') return 'small';
  return undefined;
}

/** Kind of machine, without its size: MediumOreRefinery -> OreRefinery, SpiceRefinery -> SpiceRefinery. */
export function stationFamily(stationId: string): string {
  return stationId.replace(/^(Small|Medium|Large)/, '');
}

/** Machine size chosen per kind of machine (family). */
export type MachinePrefs = Readonly<Record<string, StationSize>>;

/** A kind of machine the player can choose a size for, with its station ID per size. */
export interface MachineFamily {
  family: string;
  stations: { size: StationSize; station: string }[];
}

function sizedStations(data: GameData, recipeId: string): string[] {
  return data.recipes[recipeId]!.stations.filter((s) => stationSize(s) !== undefined);
}

/** Kind of machine that makes an item's alternative recipes; undefined when it has only one recipe. */
export function alternativeFamily(data: GameData, itemId: string): string | undefined {
  const producers = data.items[itemId]?.producers ?? [];
  if (producers.length < 2) return undefined;
  const station = producers.flatMap((id) => sizedStations(data, id))[0];
  return station === undefined ? undefined : stationFamily(station);
}

/** Every kind of machine that alternative recipes use, with its sizes from small to large. */
export function machineFamilies(data: GameData): MachineFamily[] {
  const families = new Map<string, Map<StationSize, string>>();
  for (const item of Object.values(data.items)) {
    if (item.producers.length < 2) continue;
    for (const station of item.producers.flatMap((id) => sizedStations(data, id))) {
      const sizes = families.get(stationFamily(station)) ?? new Map<StationSize, string>();
      sizes.set(stationSize(station)!, station);
      families.set(stationFamily(station), sizes);
    }
  }
  return [...families.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, sizes]) => ({
      family,
      stations: STATION_SIZES.filter((s) => sizes.has(s)).map((size) => ({ size, station: sizes.get(size)! })),
    }));
}

function recipeRank(data: GameData, recipeId: string): number | undefined {
  const ranks = sizedStations(data, recipeId).map((s) => RANK[stationSize(s)!]);
  return ranks.length ? Math.min(...ranks) : undefined;
}

/**
 * Default recipe for an item: the largest machine not above the preferred
 * size, else the smallest one above it. `preferred` is one size for every
 * kind of machine, or a size per kind (missing kinds use DEFAULT_SIZE).
 * Undefined for raw materials.
 */
export function defaultRecipe(data: GameData, itemId: string, preferred: StationSize | MachinePrefs): string | undefined {
  const producers = data.items[itemId]?.producers ?? [];
  if (producers.length <= 1) return producers[0];

  const size =
    typeof preferred === 'string' ? preferred : (preferred[alternativeFamily(data, itemId) ?? ''] ?? DEFAULT_SIZE);
  const target = RANK[size];
  let best: { id: string; rank: number } | undefined;
  for (const id of producers) {
    const rank = recipeRank(data, id) ?? target;
    if (!best) {
      best = { id, rank };
      continue;
    }
    const fits = rank <= target;
    const bestFits = best.rank <= target;
    if (fits && (!bestFits || rank > best.rank)) best = { id, rank };
    else if (!fits && !bestFits && rank < best.rank) best = { id, rank };
  }
  return best!.id;
}

export type RecipeResolver = (itemId: string) => string | undefined;

/** Resolver honouring per-item overrides, falling back to the machine sizes. */
export function makeRecipeResolver(
  data: GameData,
  overrides: Readonly<Record<string, string>>,
  preferred: StationSize | MachinePrefs,
): RecipeResolver {
  return (itemId) => {
    const chosen = overrides[itemId];
    if (chosen && data.recipes[chosen]?.outputs[itemId]) return chosen;
    return defaultRecipe(data, itemId, preferred);
  };
}
