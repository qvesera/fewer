-- Version history for saved graphs.
-- A snapshot of a saved graph's data is recorded on every save (deduped in the
-- API) so a user can restore any past version. Owner-only, mirrors saved_graphs.
create table if not exists public.graph_versions (
  id uuid primary key default gen_random_uuid(),
  saved_graph_id uuid not null references public.saved_graphs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  node_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.graph_versions enable row level security;

drop policy if exists "graph_versions_select" on public.graph_versions;
create policy "graph_versions_select" on public.graph_versions
  for select using (auth.uid() = user_id);

drop policy if exists "graph_versions_insert" on public.graph_versions;
create policy "graph_versions_insert" on public.graph_versions
  for insert with check (auth.uid() = user_id);

drop policy if exists "graph_versions_update" on public.graph_versions;
create policy "graph_versions_update" on public.graph_versions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "graph_versions_delete" on public.graph_versions;
create policy "graph_versions_delete" on public.graph_versions
  for delete using (auth.uid() = user_id);

create index if not exists graph_versions_graph_idx
  on public.graph_versions (saved_graph_id, created_at desc);