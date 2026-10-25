import { describe, expect, it, vi } from 'vitest';
import { addOwned } from '../state/changes';
import { EMPTY_SHARED, type SharedState } from '../state/persist';
import { SharedList, type ListBackend, type Snapshot } from './sharedList';

/** In-memory server with the same contract as the Supabase functions, plus a broadcast bus. */
class FakeServer {
  lists = new Map<string, { state: SharedState; version: number }>();
  listeners = new Map<string, Set<(s: Snapshot) => void>>();
  offline = false;
  saves = 0;

  backend(): ListBackend {
    const check = () => {
      if (this.offline) throw new Error('network down');
    };
    return {
      create: async (state) => {
        check();
        const id = `list-${this.lists.size + 1}`;
        this.lists.set(id, { state, version: 1 });
        return id;
      },
      get: async (id) => {
        check();
        const list = this.lists.get(id);
        return list && { ...list };
      },
      save: async (id, state, expected) => {
        check();
        this.saves++;
        const list = this.lists.get(id);
        if (!list || list.version !== expected) return undefined;
        this.lists.set(id, { state, version: expected + 1 });
        return expected + 1;
      },
      subscribe: (id, onRemote, onConnect) => {
        const set = this.listeners.get(id) ?? new Set();
        set.add(onRemote);
        this.listeners.set(id, set);
        onConnect();
        return () => set.delete(onRemote);
      },
      broadcast: (id, snapshot) => {
        for (const listener of this.listeners.get(id) ?? []) listener(snapshot);
      },
    };
  }
}

const sanitize = (value: unknown) => value as SharedState;

async function client(server: FakeServer, id: string) {
  const list = new SharedList(server.backend(), id, { sanitize, onChange: () => {}, retryMs: 5 }, EMPTY_SHARED);
  await list.start();
  return list;
}

/** Lets queued saves and broadcasts run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const setOwned = (item: string, qty: number) => (s: SharedState) => ({ ...s, owned: { ...s.owned, [item]: qty } });
const addItem = (item: string) => (s: SharedState) => ({ ...s, build: [...s.build, { item, qty: 1, quality: 0 }] });

describe('SharedList', () => {
  it('loads the list and shows an edit before it is saved', async () => {
    const server = new FakeServer();
    const id = await server.backend().create({ ...EMPTY_SHARED, owned: { IronBar: 3 } });
    const list = await client(server, id);
    expect(list.status).toBe('live');
    expect(list.state.owned).toEqual({ IronBar: 3 });

    list.apply(setOwned('SteelBar', 2));
    expect(list.state.owned).toEqual({ IronBar: 3, SteelBar: 2 });
    await settle();
    expect(server.lists.get(id)).toEqual({ state: list.state, version: 2 });
  });

  it('brings every player the others’ edits', async () => {
    const server = new FakeServer();
    const id = await server.backend().create(EMPTY_SHARED);
    const a = await client(server, id);
    const b = await client(server, id);

    a.apply(addItem('SteelBar'));
    await settle();
    expect(b.state.build.map((e) => e.item)).toEqual(['SteelBar']);
  });

  it('replays an edit on top of a save it raced with, so nothing is lost', async () => {
    const server = new FakeServer();
    const id = await server.backend().create(EMPTY_SHARED);
    const a = await client(server, id);
    const b = await client(server, id);

    // Both edit the same version before either save lands.
    a.apply(setOwned('IronBar', 4));
    b.apply(setOwned('Silicone', 5));
    await settle();
    await settle();

    const expected = { IronBar: 4, Silicone: 5 };
    expect(server.lists.get(id)!.state.owned).toEqual(expected);
    expect(a.state.owned).toEqual(expected);
    expect(b.state.owned).toEqual(expected);
    expect(server.lists.get(id)!.version).toBe(3);
  });

  it('counts two players’ + on the same item as two, even when their saves race', async () => {
    const server = new FakeServer();
    const id = await server.backend().create({ ...EMPTY_SHARED, owned: { IronBar: 3 } });
    const a = await client(server, id);
    const b = await client(server, id);

    a.apply(addOwned('IronBar', 1));
    b.apply(addOwned('IronBar', 1));
    await settle();
    await settle();

    expect(server.lists.get(id)!.state.owned).toEqual({ IronBar: 5 });
    expect(a.state.owned).toEqual({ IronBar: 5 });
    expect(b.state.owned).toEqual({ IronBar: 5 });
  });

  it('keeps edits made offline and saves them when the network is back', async () => {
    const server = new FakeServer();
    const id = await server.backend().create(EMPTY_SHARED);
    const list = await client(server, id);

    server.offline = true;
    list.apply(setOwned('IronBar', 7));
    await settle();
    expect(list.status).toBe('offline');
    expect(list.state.owned).toEqual({ IronBar: 7 });

    server.offline = false;
    await vi.waitFor(() => expect(list.status).toBe('live'));
    expect(server.lists.get(id)!.state.owned).toEqual({ IronBar: 7 });
  });

  it('does not go back to an older state when a newer one arrived during a save', async () => {
    const server = new FakeServer();
    const id = await server.backend().create(EMPTY_SHARED);
    const list = await client(server, id);
    const backend = server.backend();

    // Simulate: our save lands as v2, then someone else's v3 is broadcast before our save's reply.
    const original = backend.save;
    const slowList = new SharedList(
      {
        ...backend,
        save: async (...args) => {
          const version = await original(...args);
          backend.broadcast(id, { state: { ...EMPTY_SHARED, owned: { Water: 9 } }, version: 3 });
          return version;
        },
      },
      id,
      { sanitize, onChange: () => {} },
      EMPTY_SHARED,
    );
    await slowList.start();
    slowList.apply(setOwned('IronBar', 1));
    await settle();
    expect(slowList.state.owned).toEqual({ Water: 9 });
    list.stop();
  });

  it('reports a list that does not exist', async () => {
    const server = new FakeServer();
    const list = await client(server, 'nope');
    expect(list.status).toBe('missing');
  });
});
