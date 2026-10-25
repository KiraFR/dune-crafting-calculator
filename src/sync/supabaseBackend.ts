// ListBackend on Supabase: the three SQL functions of
// supabase/migrations/*_lists.sql for storage, and a Realtime broadcast
// channel per list ("list:<id>") for live updates between players. Loaded on
// demand by the store (dynamic import), so the personal list does not pay for it.

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { ListBackend, Snapshot } from './sharedList';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Undefined when the site is built without Supabase settings: guild lists are then unavailable. */
export const supabase: SupabaseClient | undefined =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) : undefined;

export function supabaseBackend(client: SupabaseClient): ListBackend {
  const channels = new Map<string, RealtimeChannel>();

  return {
    async create(state) {
      const { data, error } = await client.rpc('create_list', { initial_state: state });
      if (error) throw error;
      return data as string;
    },

    async get(id) {
      const { data, error } = await client.rpc('get_list', { list_id: id });
      if (error) throw error;
      const row = (data as Snapshot[] | null)?.[0];
      return row && { state: row.state, version: row.version };
    },

    async save(id, state, expectedVersion) {
      const { data, error } = await client.rpc('save_list', {
        list_id: id,
        new_state: state,
        expected_version: expectedVersion,
      });
      if (error) throw error;
      return (data as number | null) ?? undefined;
    },

    subscribe(id, onRemote, onConnect) {
      const channel = client.channel(`list:${id}`, { config: { broadcast: { self: false } } });
      channel
        .on('broadcast', { event: 'state' }, ({ payload }) => onRemote(payload as Snapshot))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onConnect();
        });
      channels.set(id, channel);
      return () => {
        channels.delete(id);
        void client.removeChannel(channel);
      };
    },

    broadcast(id, snapshot) {
      void channels.get(id)?.send({ type: 'broadcast', event: 'state', payload: snapshot });
    },
  };
}
