-- 0011_user_settings.sql
-- Per-account persisted app settings (theme, layout, display, import/export
-- preferences, sidebar). One row per user; synced to the cloud so settings are
-- retained across devices and sessions (RLS: owner only).

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select" on public.user_settings;
create policy "user_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings_insert" on public.user_settings;
create policy "user_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings_update" on public.user_settings;
create policy "user_settings_update" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-update updated_at on save (uses set_updated_at() from 0003).
drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();
