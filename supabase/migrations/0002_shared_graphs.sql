-- Shared graphs: stores graph state keyed by a short id for share links.
-- TTL 30 days; expired rows are lazily deleted on read.

create table if not exists public.shared_graphs (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.shared_graphs enable row level security;

drop policy if exists "shared_graphs_select" on public.shared_graphs;
create policy "shared_graphs_select" on public.shared_graphs
  for select using (true);

drop policy if exists "shared_graphs_insert" on public.shared_graphs;
create policy "shared_graphs_insert" on public.shared_graphs
  for insert with check (true);

drop policy if exists "shared_graphs_delete" on public.shared_graphs;
create policy "shared_graphs_delete" on public.shared_graphs
  for delete using (true);

create index if not exists shared_graphs_expires_idx on public.shared_graphs (expires_at);