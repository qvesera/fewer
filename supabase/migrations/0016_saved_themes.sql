-- 0016_saved_themes.sql
-- User-owned saved custom themes. A signed-in user can save any number of their
-- custom themes to the cloud and instantly re-apply them later from the theme
-- editor's preset dropdown (grouped under a "Custom" heading). RLS: owner only.

create table if not exists public.saved_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  theme jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_themes enable row level security;

drop policy if exists "saved_themes_select" on public.saved_themes;
create policy "saved_themes_select" on public.saved_themes
  for select using (auth.uid() = user_id);

drop policy if exists "saved_themes_insert" on public.saved_themes;
create policy "saved_themes_insert" on public.saved_themes
  for insert with check (auth.uid() = user_id);

drop policy if exists "saved_themes_update" on public.saved_themes;
create policy "saved_themes_update" on public.saved_themes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "saved_themes_delete" on public.saved_themes;
create policy "saved_themes_delete" on public.saved_themes
  for delete using (auth.uid() = user_id);

create index if not exists saved_themes_user_idx on public.saved_themes (user_id, updated_at desc);

-- Auto-update updated_at on save (uses set_updated_at() from 0003).
drop trigger if exists saved_themes_set_updated_at on public.saved_themes;
create trigger saved_themes_set_updated_at
  before update on public.saved_themes
  for each row execute function public.set_updated_at();