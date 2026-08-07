-- Per-invitee share tokens. Each invited email gets a unique token; opening
-- #i:<token> grants access to the shared graph without login.
create table if not exists public.share_invites (
  id uuid primary key default gen_random_uuid(),
  share_id text not null references public.shared_graphs (id) on delete cascade,
  email text not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.share_invites enable row level security;

-- Owner can manage invites for their shares.
drop policy if exists "share_invites_select" on public.share_invites;
create policy "share_invites_select" on public.share_invites
  for select using (
    exists (
      select 1 from public.shared_graphs s
      where s.id = share_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "share_invites_insert" on public.share_invites;
create policy "share_invites_insert" on public.share_invites
  for insert with check (
    exists (
      select 1 from public.shared_graphs s
      where s.id = share_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "share_invites_delete" on public.share_invites;
create policy "share_invites_delete" on public.share_invites
  for delete using (
    exists (
      select 1 from public.shared_graphs s
      where s.id = share_id and s.owner_id = auth.uid()
    )
  );

-- Token lookup is public: the token itself is the credential.
drop policy if exists "share_invites_token_lookup" on public.share_invites;
create policy "share_invites_token_lookup" on public.share_invites
  for select using (true);

create index if not exists share_invites_share_idx on public.share_invites (share_id);
create index if not exists share_invites_token_idx on public.share_invites (token);