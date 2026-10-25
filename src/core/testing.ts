// Shared helpers for unit tests.

import rawSiteData from '../../data/site-data.json';
import { indexGameData, type GameData, type RawRecipe, type RawSiteData } from './gameData';

export const realData: GameData = indexGameData(rawSiteData);

/** Small hand-written data set: item ID -> name, recipe ID -> recipe. */
export function fixture(items: string[], recipes: Record<string, RawRecipe>): GameData {
  const raw: RawSiteData = {
    schema: 1,
    source: { game: 'test', clientBuild: '0', serverBuild: '0', generated: '2026-01-01' },
    stations: { Bench: 'Bench' },
    categories: [],
    items: Object.fromEntries(items.map((id) => [id, { n: id }])),
    recipes,
  };
  return indexGameData(raw);
}

/** `remaining` of every raw material in a plan, as a plain object. */
export function rawRemaining(plan: { raw: { item: string; remaining: number }[] }): Record<string, number> {
  return Object.fromEntries(plan.raw.map((l) => [l.item, l.remaining]));
}

/** Recipe resolver from a fixed item -> recipe map. */
export function lookup(map: Record<string, string>): (item: string) => string | undefined {
  return (item) => map[item];
}
