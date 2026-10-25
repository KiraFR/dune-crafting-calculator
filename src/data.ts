import rawSiteData from '../data/site-data.json';
import namesFr from '../data/names.fr.json';
import { indexGameData, type Item, type Translation } from './core/gameData';
import type { Lang } from './state/persist';

export const gameData = indexGameData(rawSiteData);

/** Game names per language; English is the data file itself. */
export const translations: Record<Lang, Translation | undefined> = { en: undefined, fr: namesFr };

/** Items at least one recipe produces: what can go in a build list. */
export const craftableItems: Item[] = Object.values(gameData.items).filter((i) => i.producers.length > 0);
