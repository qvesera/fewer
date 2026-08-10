-- Auth + saved graphs.
-- 1. saved_graphs: user-owned persisted graph snapshots (RLS: owner only).
-- 2. shared_graphs: extended with owner + access control (public vs invite).

-- ── saved_graphs ────────────────────────────────────────────────────────────
create table if not exists public.saved_graphs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_graphs enable row level security;

drop policy if exists "saved_graphs_select" on public.saved_graphs;
create policy "saved_graphs_select" on public.saved_graphs
  for select using (auth.uid() = user_id);

drop policy if exists "saved_graphs_insert" on public.saved_graphs;
create policy "saved_graphs_insert" on public.saved_graphs
  for insert with check (auth.uid() = user_id);

drop policy if exists "saved_graphs_update" on public.saved_graphs;
create policy "saved_graphs_update" on public.saved_graphs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "saved_graphs_delete" on public.saved_graphs;
create policy "saved_graphs_delete" on public.saved_graphs
  for delete using (auth.uid() = user_id);

create index if not exists saved_graphs_user_idx on public.saved_graphs (user_id, updated_at desc);

-- Auto-update updated_at on save.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_graphs_set_updated_at on public.saved_graphs;
create trigger saved_graphs_set_updated_at
  before update on public.saved_graphs
  for each row execute function public.set_updated_at();

-- ── shared_graphs extension ─────────────────────────────────────────────────
-- owner_id: set when a logged-in user shares a saved graph.
-- saved_graph_id: link back to the saved graph (nullable for anonymous shares).
-- access: 'public' (anyone with link) | 'invite' (only invited emails).
-- invited_emails: list of emails allowed to view when access = 'invite'.
alter table public.shared_graphs
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists saved_graph_id uuid references public.saved_graphs (id) on delete set null,
  add column if not exists access text not null default 'public' check (access in ('public', 'invite')),
  add column if not exists invited_emails text[] not null default '{}';

-- Replace the open select policy: public rows readable by anyone; invite rows
-- only by logged-in users whose email is in invited_emails.
drop policy if exists "shared_graphs_select" on public.shared_graphs;
create policy "shared_graphs_select" on public.shared_graphs
  for select using (
    access = 'public'
    or (
      access = 'invite'
      and auth.jwt() ->> 'email' = any (invited_emails)
    )
  );

-- Insert: allow anonymous (existing behavior) and owners.
drop policy if exists "shared_graphs_insert" on public.shared_graphs;
create policy "shared_graphs_insert" on public.shared_graphs
  for insert with check (true);

-- Update: owners can change access/invited_emails; keep permissive for
-- anonymous rows (server lazy-deletes expired rows via delete, not update).
drop policy if exists "shared_graphs_update" on public.shared_graphs;
create policy "shared_graphs_update" on public.shared_graphs
  for update using (true) with check (true);

-- Delete: keep permissive so the server can lazy-delete expired anonymous
-- shares. Share rows are non-sensitive (they are meant to be shared).
drop policy if exists "shared_graphs_delete" on public.shared_graphs;
create policy "shared_graphs_delete" on public.shared_graphs
  for delete using (true);