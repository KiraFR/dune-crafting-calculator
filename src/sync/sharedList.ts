// A guild list kept in sync with the server and the other players.
//
// Every edit is a pure function of the shared state. It shows at once
// (optimistically) and is then saved with a compare-and-swap on the list's
// version; if someone saved first, the latest list is read back and the same
// edit is replayed on top. Saves broadcast the new state, so the others see it
// within a moment; a client that reconnects reads the list again.

import type { SharedState } from '../state/persist';

export type Change = (state: SharedState) => SharedState;

export interface Snapshot {
  state: unknown;
  version: number;
}

/** What a shared list needs from a server (Supabase in the app, a fake in tests). */
export interface ListBackend {
  create(state: SharedState): Promise<string>;
  /** Undefined when no list has this id. */
  get(id: string): Promise<Snapshot | undefined>;
  /** Saves if the list is still at `expectedVersion`: the new version, or undefined when it moved on. */
  save(id: string, state: SharedState, expectedVersion: number): Promise<number | undefined>;
  /** Live states sent by others; `onConnect` fires on every (re)connection. Returns an unsubscribe. */
  subscribe(id: string, onRemote: (snapshot: Snapshot) => void, onConnect: () => void): () => void;
  broadcast(id: string, snapshot: { state: SharedState; version: number }): void;
}

export type SyncStatus = 'loading' | 'live' | 'saving' | 'offline' | 'missing';

export interface SharedListOptions {
  /** Turns whatever the server holds into a valid state (drops unknown items). */
  sanitize: (value: unknown) => SharedState;
  onChange: () => void;
  /** Delay before retrying after a network error; grows up to 30 s. */
  retryMs?: number;
}

/** A conflicting save is retried this many times before the edit is dropped. */
const MAX_CONFLICTS = 10;

export class SharedList {
  status: SyncStatus = 'loading';
  private confirmed: SharedState;
  private version = 0;
  private pending: Change[] = [];
  private flushing = false;
  private retryDelay: number;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private cached: SharedState | undefined;

  constructor(
    private readonly backend: ListBackend,
    readonly id: string,
    private readonly options: SharedListOptions,
    initial: SharedState,
  ) {
    this.confirmed = initial;
    this.retryDelay = options.retryMs ?? 1000;
  }

  /** The list as this player sees it: the server's state plus their edits not saved yet. */
  get state(): SharedState {
    this.cached ??= this.pending.reduce((s, change) => change(s), this.confirmed);
    return this.cached;
  }

  async start(): Promise<void> {
    this.unsubscribe = this.backend.subscribe(
      this.id,
      (snapshot) => this.receive(snapshot),
      () => void this.refresh(),
    );
    await this.refresh();
  }

  stop(): void {
    this.unsubscribe?.();
    clearTimeout(this.retryTimer);
  }

  /** Applies an edit now and saves it in the background. */
  apply(change: Change): void {
    this.pending.push(change);
    this.changed();
    void this.flush();
  }

  /** Reads the list from the server (on start, reconnection, or when the tab comes back). */
  async refresh(): Promise<void> {
    try {
      const snapshot = await this.backend.get(this.id);
      if (!snapshot) {
        this.status = 'missing';
        this.changed();
        return;
      }
      this.receive(snapshot, true);
      if (this.status === 'loading' || this.status === 'offline') this.status = this.pending.length ? 'saving' : 'live';
      this.changed();
      void this.flush();
    } catch {
      this.goOffline();
    }
  }

  private receive(snapshot: Snapshot, force = false): void {
    if (!force && snapshot.version <= this.version) return;
    if (force && snapshot.version < this.version) return;
    this.confirmed = this.options.sanitize(snapshot.state);
    this.version = snapshot.version;
    this.changed();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.status === 'loading' || this.status === 'missing') return;
    this.flushing = true;
    let conflicts = 0;
    try {
      while (this.pending.length) {
        this.status = 'saving';
        const next = this.pending[0]!(this.confirmed);
        const saved = await this.backend.save(this.id, next, this.version);
        if (saved !== undefined) {
          // A newer state may have arrived by broadcast while this save was in flight: keep it.
          if (saved > this.version) {
            this.confirmed = next;
            this.version = saved;
          }
          this.pending.shift();
          conflicts = 0;
          this.backend.broadcast(this.id, { state: next, version: saved });
        } else if (++conflicts > MAX_CONFLICTS) {
          this.pending.shift();
          conflicts = 0;
        } else {
          const latest = await this.backend.get(this.id);
          if (!latest) {
            this.status = 'missing';
            this.pending = [];
            this.changed();
            return;
          }
          this.receive(latest, true);
        }
        this.changed();
      }
      this.status = 'live';
      this.retryDelay = this.options.retryMs ?? 1000;
      this.changed();
    } catch {
      this.goOffline();
    } finally {
      this.flushing = false;
    }
  }

  /** Network error: keep the edits, show offline, and try again later. */
  private goOffline(): void {
    this.status = 'offline';
    this.changed();
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.refresh(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  private changed(): void {
    this.cached = undefined;
    this.options.onChange();
  }
}
