-- Guild lists shared by secret link. A list's UUID is the secret: whoever has
-- it can read and write that list, and nobody can enumerate the lists. The
-- table is closed to the API roles; they only go through the functions below.
-- Real-time updates travel on a Realtime broadcast channel named after the
-- list (see src/sync/supabaseBackend.ts); this table is the source of truth.

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  -- { build, owned, machines }: the shared part of the calculator state.
  state jsonb not null,
  -- Bumped by every save; saves name the version they started from.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lists_state_is_object check (jsonb_typeof(state) = 'object'),
  -- A real list is a few KB; this keeps the table from being used as storage.
  constraint lists_state_size check (pg_column_size(state) <= 65536)
);

alter table public.lists enable row level security;
revoke all on public.lists from anon, authenticated;

create function public.create_list(initial_state jsonb)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into lists (state) values (initial_state) returning id;
$$;

create function public.get_list(list_id uuid)
returns table (state jsonb, version integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.state, l.version from lists l where l.id = list_id;
$$;

-- Compare-and-swap: saves only if nobody saved since `expected_version`.
-- Returns the new version, or null when the list moved on or does not exist;
-- the client then reads the list again and replays its change on top.
create function public.save_list(list_id uuid, new_state jsonb, expected_version integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update lists
  set state = new_state, version = version + 1, updated_at = now()
  where id = list_id and version = expected_version
  returning version;
$$;

revoke execute on function public.create_list(jsonb) from public;
revoke execute on function public.get_list(uuid) from public;
revoke execute on function public.save_list(uuid, jsonb, integer) from public;
grant execute on function public.create_list(jsonb) to anon, authenticated;
grant execute on function public.get_list(uuid) to anon, authenticated;
grant execute on function public.save_list(uuid, jsonb, integer) to anon, authenticated;
