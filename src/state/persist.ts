// Shape of the saved calculator state, and how to read it back safely: the
// saved JSON may come from an older data build or an older version of the
// page, so anything that no longer matches is dropped instead of breaking it.

import type { GameData } from '../core/gameData';
import { machineFamilies, STATION_SIZES, type StationSize } from '../core/recipeChoice';

export type Lang = 'en' | 'fr';

export const LANGS: readonly Lang[] = ['en', 'fr'];

export interface BuildEntry {
  item: string;
  qty: number;
  quality: number;
}

/** The part of the state a guild list shares. */
export interface SharedState {
  build: BuildEntry[];
  /** Owned quantity by item ID; absent means none. */
  owned: Record<string, number>;
  /** Machine size per kind of refinery (OreRefinery, ...); absent kinds use the default size. */
  machines: Record<string, StationSize>;
}

/** The whole state: the shared part plus personal settings. */
export interface CalcState extends SharedState {
  lang: Lang;
}

export const EMPTY_SHARED: SharedState = { build: [], owned: {}, machines: {} };

export const EMPTY_STATE: CalcState = { ...EMPTY_SHARED, lang: 'en' };

export function sharedPart({ build, owned, machines }: SharedState): SharedState {
  return { build, owned, machines };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isSize(value: unknown): value is StationSize {
  return STATION_SIZES.includes(value as StationSize);
}

export function sanitizeState(data: GameData, value: unknown, fallbackLang: Lang = EMPTY_STATE.lang): CalcState {
  const lang = isRecord(value) && LANGS.includes(value.lang as Lang) ? (value.lang as Lang) : fallbackLang;
  return { ...sanitizeShared(data, value), lang };
}

/** The shared part of a saved or received state; also what a guild list reads from the server. */
export function sanitizeShared(data: GameData, value: unknown): SharedState {
  if (!isRecord(value)) return EMPTY_SHARED;

  const build: BuildEntry[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(value.build) ? value.build : []) {
    if (!isRecord(entry) || typeof entry.item !== 'string') continue;
    if (seen.has(entry.item) || !data.items[entry.item]?.producers.length) continue;
    seen.add(entry.item);
    build.push({ item: entry.item, qty: wholeNumber(entry.qty), quality: wholeNumber(entry.quality) });
  }

  const owned: Record<string, number> = {};
  if (isRecord(value.owned)) {
    for (const [item, qty] of Object.entries(value.owned)) {
      if (data.items[item] && wholeNumber(qty)) owned[item] = wholeNumber(qty);
    }
  }

  // Older saves had one refinery size for everything: it becomes the size of every kind.
  const machines: Record<string, StationSize> = {};
  for (const { family, stations } of machineFamilies(data)) {
    const size = isRecord(value.machines) ? value.machines[family] : value.size;
    if (isSize(size) && stations.some((s) => s.size === size)) machines[family] = size;
  }

  return { build, owned, machines };
}
