-- Watched public file indexes: per-user watchlist for the nightly change
-- digest. Each row stores the last crawled tree as a baseline so the nightly
-- job can diff against it and email the owner when something changed.

create table if not exists public.watched_indexes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  active boolean not null default true,
  last_tree jsonb,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

alter table public.watched_indexes enable row level security;

-- Owner-only CRUD, same pattern as saved_graphs.
drop policy if exists "watched_indexes_select" on public.watched_indexes;
create policy "watched_indexes_select" on public.watched_indexes
  for select using (auth.uid() = user_id);

drop policy if exists "watched_indexes_insert" on public.watched_indexes;
create policy "watched_indexes_insert" on public.watched_indexes
  for insert with check (auth.uid() = user_id);

drop policy if exists "watched_indexes_update" on public.watched_indexes;
create policy "watched_indexes_update" on public.watched_indexes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watched_indexes_delete" on public.watched_indexes;
create policy "watched_indexes_delete" on public.watched_indexes
  for delete using (auth.uid() = user_id);

create index if not exists watched_indexes_user_idx on public.watched_indexes (user_id);