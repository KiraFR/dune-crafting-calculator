// Interface text and game names in the chosen language. Game names come from
// the game's own localization (data/names.fr.json); the interface strings are
// here. A name missing from a translation falls back to English.

import { useEffect, useMemo } from 'react';
import { craftableItems, gameData, translations } from '../data';
import type { Item } from '../core/gameData';
import type { Lang } from '../state/persist';
import { useCalcState } from '../state/store';

const EN = {
  title: 'Crafting calculator',
  overlay: 'Overlay',
  language: 'Language',
  addItems: 'Add items',
  categories: 'Categories',
  all: 'All',
  other: 'Other',
  searchItems: 'Search items',
  add: 'Add',
  selectedItems: 'Selected items',
  clear: 'Clear',
  emptyHint: 'Add items from the list to see what to gather and craft.',
  tryExample: 'Try {qty} × {name}',
  quality: 'Quality {q}',
  qualityOf: '{name} quality',
  quantityOf: '{name} quantity',
  remove: 'Remove {name}',
  machines: 'Machines',
  oreRefinery: 'Ore refinery',
  chemicalRefinery: 'Chemical refinery',
  spiceRefinery: 'Spice refinery',
  filters: 'Filters',
  unique: 'Unique',
  tier: 'Tier {n}',
  noResults: 'No item matches these filters.',
  rawMaterials: 'Raw materials',
  craftingSteps: 'Crafting steps',
  untickAll: 'Untick all',
  have: 'have {n}',
  craftsOne: '{n} craft',
  craftsOther: '{n} crafts',
  haveAll: 'I have all the {name}',
  enterOwned: 'Click to enter how many you already have',
  ownedOf: 'How many {name} you have',
  leftLess: 'One less to do: {name}',
  leftMore: 'One more to do: {name}',
  cannotPlan: 'This build cannot be planned: {error}',
  dataSource: 'Game data from client build {build} ({date}).',
  remaining: 'Remaining',
  gather: 'Gather',
  craft: 'Craft',
  allCovered: 'Everything is covered.',
  nothingToGather: 'Nothing left to gather.',
  nothingToCraft: 'Nothing left to craft.',
  share: 'Share with guild',
  shareFailed: 'Could not create the guild list: {error}',
  guildList: 'Guild list',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  myList: 'My list',
  statusLoading: 'connecting',
  statusLive: 'live',
  statusSaving: 'sending',
  statusOffline: 'offline, retrying',
  statusMissing: 'not found',
  listMissing: 'This guild list does not exist, or the link is incomplete.',
};

export type StringKey = keyof typeof EN;

const FR: Record<StringKey, string> = {
  title: 'Calculateur de craft',
  overlay: 'Overlay',
  language: 'Langue',
  addItems: 'Ajouter des objets',
  categories: 'Catégories',
  all: 'Tout',
  other: 'Autres',
  searchItems: 'Rechercher un objet',
  add: 'Ajouter',
  selectedItems: 'Objets sélectionnés',
  clear: 'Vider',
  emptyHint: 'Ajouter des objets depuis la liste pour voir quoi récolter et fabriquer.',
  tryExample: 'Essayer {qty} × {name}',
  quality: 'Qualité {q}',
  qualityOf: 'Qualité de {name}',
  quantityOf: 'Quantité de {name}',
  remove: 'Retirer {name}',
  machines: 'Machines',
  oreRefinery: 'Raffinerie de minerai',
  chemicalRefinery: 'Raffinerie chimique',
  spiceRefinery: 'Raffinerie d’épice',
  filters: 'Filtres',
  unique: 'Unique',
  tier: 'Tier {n}',
  noResults: 'Aucun objet ne correspond à ces filtres.',
  rawMaterials: 'Matières premières',
  craftingSteps: 'Étapes de fabrication',
  untickAll: 'Tout décocher',
  have: 'j’en ai {n}',
  craftsOne: '{n} fabrication',
  craftsOther: '{n} fabrications',
  haveAll: 'J’ai tout : {name}',
  enterOwned: 'Cliquer pour saisir la quantité déjà possédée',
  ownedOf: 'Quantité de {name} possédée',
  leftLess: '1 de moins à faire : {name}',
  leftMore: '1 de plus à faire : {name}',
  cannotPlan: 'Impossible de calculer cette liste : {error}',
  dataSource: 'Données du jeu : build client {build} ({date}).',
  remaining: 'Reste à faire',
  gather: 'À récolter',
  craft: 'À fabriquer',
  allCovered: 'Tout est couvert.',
  nothingToGather: 'Plus rien à récolter.',
  nothingToCraft: 'Plus rien à fabriquer.',
  share: 'Partager avec la guilde',
  shareFailed: 'Impossible de créer la liste de guilde : {error}',
  guildList: 'Liste de guilde',
  copyLink: 'Copier le lien',
  linkCopied: 'Lien copié',
  myList: 'Ma liste',
  statusLoading: 'connexion',
  statusLive: 'en direct',
  statusSaving: 'envoi',
  statusOffline: 'hors ligne, nouvel essai',
  statusMissing: 'introuvable',
  listMissing: 'Cette liste de guilde n’existe pas, ou le lien est incomplet.',
};

const STRINGS: Record<Lang, Record<StringKey, string>> = { en: EN, fr: FR };

const LOCALES: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR' };

/** The game has no name for a kind of machine on its own, only for each size. */
const FAMILY_KEYS: Record<string, StringKey> = {
  OreRefinery: 'oreRefinery',
  ChemicalRefinery: 'chemicalRefinery',
  SpiceRefinery: 'spiceRefinery',
};

export interface I18n {
  lang: Lang;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  item: (id: string) => string;
  station: (id: string) => string;
  /** Translates one element of an English category path. */
  category: (englishName: string) => string;
  /** Name of a kind of machine (OreRefinery, ...). */
  family: (family: string) => string;
  qty: (n: number) => string;
  /** Craftable items sorted by their name in this language. */
  craftable: Item[];
}

function makeI18n(lang: Lang): I18n {
  const names = translations[lang];
  const strings = STRINGS[lang];
  const numbers = new Intl.NumberFormat(LOCALES[lang]);

  const categoryNames = new Map<string, string>();
  gameData.categories.forEach((path, i) =>
    path.forEach((name, depth) => {
      const translated = names?.categories[i]?.[depth];
      if (translated && !categoryNames.has(name)) categoryNames.set(name, translated);
    }),
  );

  const item = (id: string) => names?.items[id] ?? gameData.items[id]?.name ?? id;
  const collator = new Intl.Collator(LOCALES[lang]);
  return {
    lang,
    t: (key, vars = {}) => strings[key].replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? `{${v}}`)),
    item,
    station: (id) => names?.stations[id] ?? gameData.stations[id] ?? id,
    category: (name) => categoryNames.get(name) ?? name,
    family: (family) => {
      const key = FAMILY_KEYS[family];
      return key ? strings[key] : family;
    },
    qty: (n) => numbers.format(n),
    craftable: [...craftableItems].sort((a, b) => collator.compare(item(a.id), item(b.id))),
  };
}

const cache = new Map<Lang, I18n>();

export function i18nFor(lang: Lang): I18n {
  let i18n = cache.get(lang);
  if (!i18n) cache.set(lang, (i18n = makeI18n(lang)));
  return i18n;
}

export function useI18n(): I18n {
  const { lang } = useCalcState();
  return useMemo(() => i18nFor(lang), [lang]);
}

/** Keeps the page's lang attribute and tab title in the chosen language. */
export function useDocumentLanguage(title: StringKey): void {
  const { lang, t } = useI18n();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t(title)} · Dune: Awakening`;
  }, [lang, t, title]);
}
