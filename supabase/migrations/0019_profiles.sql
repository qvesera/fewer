-- 0019_profiles.sql
-- Per-account profile info (first/last name, username) submitted from
-- Settings → Account. One row per user; synced to the cloud so the profile is
-- retained across devices and sessions (RLS: owner only). Cascade-deleted with
-- the auth user so account deletion stays fully implicit.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  username text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Table-level privileges for the PostgREST-issued roles. RLS still gates every
-- row to the owner, but without these the upsert in /api/profile is rejected
-- with "permission denied for table profiles". anon can only read (RLS gives
-- them nothing of others'); authenticated owns their single row's CRUD.
grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (auth.uid() = user_id);

-- Auto-update updated_at on save (uses set_updated_at() from 0003).
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();