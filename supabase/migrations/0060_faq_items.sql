-- 0060_faq_items.sql
-- Landing page FAQ: the questions the marketing page answers, held in the
-- database so the copy can be edited without a code release. Same shape as
-- content_pages (0021): the app reads published rows through the public
-- select policy, writes happen with the service role (Supabase Studio), and
-- the landing page revalidates every 60s - so an edit goes live without a
-- deploy.
--
-- Why a table of its own and not a `content_pages` type: content_pages is
-- one markdown blob per page with a (type, slug) key and no ordering, while
-- a FAQ is a list of short rows the landing page renders in a fixed order.
--
-- Seeded with the six questions the README already answers (README §FAQ is
-- the source-of-record copy; src/lib/fewer/faq.ts carries the same six as
-- the fallback for a build or an environment with no database).
--
-- Idempotent: the seed only INSERTS (on conflict do nothing), deliberately
-- unlike the content_pages reseeds (0059) which upsert. The FAQ is
-- database-first: a row edited in the Studio must never be overwritten by a
-- later migration. `published` is likewise never touched after the insert,
-- so an operator can hide a question by setting published = false and keep
-- it hidden.

create table if not exists public.faq_items (
  slug       text primary key,
  question   text not null,
  answer     text not null,
  sort_order int  not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faq_items enable row level security;

-- Anyone can read published questions. Writes are done with the service role,
-- which bypasses RLS. Guarded so the migration is safe to re-run: Postgres has
-- no CREATE POLICY IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_policy
    join pg_class on pg_class.oid = pg_policy.polrelid
    where pg_class.relname = 'faq_items'
      and pg_policy.polname = 'public read published faq_items'
  ) then
    create policy "public read published faq_items"
      on public.faq_items
      for select
      using (published = true);
  end if;
end $$;

-- The anon key reads through the policy above, so the select grant has to be
-- there (RLS narrows rows, it does not grant access).
grant select on public.faq_items to anon, authenticated;

-- Auto-update updated_at on save (uses set_updated_at() from 0003).
drop trigger if exists faq_items_set_updated_at on public.faq_items;
create trigger faq_items_set_updated_at
  before update on public.faq_items
  for each row execute function public.set_updated_at();

create index if not exists faq_items_listing_idx
  on public.faq_items (published, sort_order);

insert into public.faq_items (slug, question, answer, sort_order)
values
  ('privacy',
   'Does fewer send my directory data anywhere?',
   'Your directory is never uploaded. Local import, editing, layout and export all run in your browser. Network calls happen only for features you opt into: GitHub, URL and Internet Archive imports, linked cloud accounts, an account (saved graphs, version history, share links, gallery), and watch digests. No telemetry, no analytics.',
   10),
  ('no-install',
   'Can I use fewer without installing anything?',
   'Yes. The standalone version runs at app.fewer.directory. The self-hosted version needs bun install and bun run dev.',
   20),
  ('firefox-safari',
   'Why does directory import not work in Firefox or Safari?',
   'Folder import works in every browser: Firefox and Safari use the webkitdirectory fallback instead of the File System Access API. What the fallback cannot do is hand back live file handles, so features that write back to disk (and the directory picker itself) stay Chrome and Edge only, and are switched off entirely in the web build.',
   30),
  ('uninstall',
   'How do I uninstall?',
   'Delete the repo folder. That is it. No background processes, no config files, no registry entries.',
   40),
  ('account',
   'Do I need an account?',
   'No. Fewer works fully without one. Signing in (optional) unlocks saving graphs to your account, opening them on another device, and invite-only sharing.',
   50),
  ('avatar',
   'Can I set my own avatar?',
   'The avatar in the toolbar is your Google or GitHub profile picture when you signed up with one, otherwise your initials. Fewer does not host user images, so there is no upload: that keeps the app free of image storage without giving up identity in the toolbar.',
   60)
on conflict (slug) do nothing;
