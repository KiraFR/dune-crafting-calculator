// Calculator state shared by every component.
//
// Two modes. Personal (no `?list=` in the URL): the state lives in
// localStorage, and an /overlay/ window in the same browser follows it through
// the `storage` event. Guild (`?list=<uuid>`): the shared part (build, owned,
// machines) is a SharedList kept in sync through Supabase, so every player and
// the overlay app see the same list; the language stays personal.

import { useSyncExternalStore } from 'react';
import type { StationSize } from '../core/recipeChoice';
import { gameData } from '../data';
import { SharedList, type Change, type ListBackend, type SyncStatus } from '../sync/sharedList';
import { addOwned, whole, withOwned } from './changes';
import { EMPTY_SHARED, EMPTY_STATE, sanitizeShared, sanitizeState, sharedPart, type CalcState, type Lang } from './persist';

export const STORAGE_KEY = 'dune-crafting-calculator:v1';

/** French for browsers set to French, English otherwise, until the player picks one. */
const browserLang: Lang = typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en';

function loadLocal(): CalcState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return sanitizeState(gameData, saved ? JSON.parse(saved) : null, browserLang);
  } catch {
    return { ...EMPTY_STATE, lang: browserLang };
  }
}

function saveLocal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}

export interface SyncInfo {
  /** The guild list shown, or undefined for the personal list. */
  listId?: string;
  status?: SyncStatus;
  /** Guild lists need a Supabase project in the build settings. */
  available: boolean;
}

/** Guild lists need a Supabase project in the build settings (.env.local). */
const guildConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let backendPromise: Promise<ListBackend> | undefined;

/** The Supabase client is loaded on demand: the personal list never needs it. */
function loadBackend(): Promise<ListBackend> {
  backendPromise ??= import('../sync/supabaseBackend').then(({ supabase, supabaseBackend }) => {
    if (!supabase) throw new Error('Guild lists are not configured');
    return supabaseBackend(supabase);
  });
  return backendPromise;
}

/** A backend that loads the real one on first use. */
function lazyBackend(): ListBackend {
  const use = <T>(fn: (b: ListBackend) => Promise<T>) => loadBackend().then(fn);
  return {
    create: (state) => use((b) => b.create(state)),
    get: (id) => use((b) => b.get(id)),
    save: (id, state, version) => use((b) => b.save(id, state, version)),
    subscribe: (id, onRemote, onConnect) => {
      let stopped = false;
      let unsubscribe: (() => void) | undefined;
      void loadBackend().then((b) => {
        if (!stopped) unsubscribe = b.subscribe(id, onRemote, onConnect);
      });
      return () => {
        stopped = true;
        unsubscribe?.();
      };
    },
    broadcast: (id, snapshot) => void loadBackend().then((b) => b.broadcast(id, snapshot)),
  };
}

const listeners = new Set<() => void>();
let local = loadLocal();
let shared: SharedList | undefined;
let state: CalcState = local;
let syncInfo: SyncInfo = { available: guildConfigured };

function refreshViews(): void {
  state = shared ? { ...shared.state, lang: local.lang } : local;
  syncInfo = { listId: shared?.id, status: shared?.status, available: guildConfigured };
  for (const listener of listeners) listener();
}

// Guarded so the module also loads in unit tests, which run outside a browser.
if (typeof window !== 'undefined') {
  const listId = new URLSearchParams(window.location.search).get('list');
  if (listId !== null) {
    shared = new SharedList(
      lazyBackend(),
      listId,
      { sanitize: (value) => sanitizeShared(gameData, value), onChange: refreshViews },
      EMPTY_SHARED,
    );
    // List ids are UUIDs; anything else cannot be a list (and would make Postgres raise).
    if (guildConfigured && UUID.test(listId)) void shared.start();
    else shared.status = 'missing';
    refreshViews();
    // A tab that comes back may have missed broadcasts while asleep.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void shared?.refresh();
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    local = loadLocal();
    refreshViews();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalcState(): CalcState {
  return useSyncExternalStore(subscribe, () => state);
}

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(subscribe, () => syncInfo);
}

/** Applies an edit to the list shown: the guild list when there is one, else the personal list. */
function update(change: Change): void {
  if (shared) {
    shared.apply(change);
    return;
  }
  local = { ...local, ...change(sharedPart(local)) };
  saveLocal();
  refreshViews();
}

export function addToBuild(item: string, qty = 1): void {
  update((s) => {
    const existing = s.build.find((e) => e.item === item);
    const build = existing
      ? s.build.map((e) => (e.item === item ? { ...e, qty: e.qty + qty } : e))
      : [...s.build, { item, qty, quality: 0 }];
    return { ...s, build };
  });
}

export function setBuildQty(item: string, qty: number): void {
  update((s) => ({ ...s, build: s.build.map((e) => (e.item === item ? { ...e, qty: whole(qty) } : e)) }));
}

export function setBuildQuality(item: string, quality: number): void {
  update((s) => ({ ...s, build: s.build.map((e) => (e.item === item ? { ...e, quality: whole(quality) } : e)) }));
}

export function removeFromBuild(item: string): void {
  update((s) => ({ ...s, build: s.build.filter((e) => e.item !== item) }));
}

export function clearBuild(): void {
  update((s) => ({ ...s, build: [] }));
}

export function setOwned(item: string, qty: number): void {
  update(withOwned(item, qty));
}

/** One more (or fewer, with a negative step) owned, never below 0: the overlay app's − / + buttons. */
export function changeOwned(item: string, delta: number): void {
  update(addOwned(item, delta));
}

export function clearOwned(): void {
  update((s) => ({ ...s, owned: {} }));
}

/** Machine size used for one kind of refinery (OreRefinery, ChemicalRefinery, SpiceRefinery). */
export function setMachine(family: string, size: StationSize): void {
  update((s) => ({ ...s, machines: { ...s.machines, [family]: size } }));
}

/** The language is personal: it never goes to a guild list. */
export function setLang(lang: Lang): void {
  local = { ...local, lang };
  saveLocal();
  refreshViews();
}

/** Turns the personal list into a new guild list and opens it; returns its id. */
export async function shareCurrentList(): Promise<string> {
  const id = await (await loadBackend()).create(sharedPart(local));
  window.location.assign(guildUrl(id));
  return id;
}

/** Address of a guild list, on the calculator or on the overlay page. */
export function guildUrl(listId: string, page: 'app' | 'overlay' = 'app'): string {
  const base = new URL(page === 'overlay' ? 'overlay/' : './', new URL(import.meta.env.BASE_URL, window.location.origin));
  base.searchParams.set('list', listId);
  return base.toString();
}

/** Leaves the guild list for the personal one. */
export function openPersonalList(): void {
  window.location.assign(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
}
