-- 0031_shared_themes.sql
-- Themes published to the community gallery.
-- One gallery row per saved theme (saved_theme_id is unique), so publishing is
-- idempotent and deleting a user's saved theme (DELETE /api/themes/[id])
-- cascade-removes its gallery listing. Author attribution (first name +
-- username) is denormalized onto the row at publish time — `profiles` RLS
-- stays owner-only, so a public listing can never read other rows.

create table if not exists public.shared_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  saved_theme_id uuid not null unique references public.saved_themes (id) on delete cascade,
  name text not null,
  theme jsonb not null,
  gallery_title text,
  gallery_description text,
  author_name text,
  author_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_themes enable row level security;

-- Owner rows are fully owner-scoped like saved_themes.
drop policy if exists "shared_themes_owner_select" on public.shared_themes;
create policy "shared_themes_owner_select" on public.shared_themes
  for select using (auth.uid() = user_id);

drop policy if exists "shared_themes_owner_insert" on public.shared_themes;
create policy "shared_themes_owner_insert" on public.shared_themes
  for insert with check (auth.uid() = user_id);

drop policy if exists "shared_themes_owner_update" on public.shared_themes;
create policy "shared_themes_owner_update" on public.shared_themes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shared_themes_owner_delete" on public.shared_themes;
create policy "shared_themes_owner_delete" on public.shared_themes
  for delete using (auth.uid() = user_id);

-- Public read: the gallery listing (/api/gallery/themes) is browsed logged-out
-- with the anon client, exactly like shared_graphs.
drop policy if exists "shared_themes_public_select" on public.shared_themes;
create policy "shared_themes_public_select" on public.shared_themes
  for select using (true);

create index if not exists shared_themes_gallery_idx
  on public.shared_themes (created_at desc);

-- Auto-update updated_at on save (uses set_updated_at() from 0003).
drop trigger if exists shared_themes_set_updated_at on public.shared_themes;
create trigger shared_themes_set_updated_at
  before update on public.shared_themes
  for each row execute function public.set_updated_at();