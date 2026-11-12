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
-- Seeded with the seven questions the README already answers (README §FAQ is
-- the source-of-record copy; src/lib/fewer/faq.ts carries the same seven as
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
  ('is-it-free',
   'Is fewer free?',
   'The core is free and needs no account: open a folder, an archive, a link or a repo, search it, arrange it and export it. A free account adds saved graphs, version history and share links. A few power features are Pro: the panel workspace, tags, exports without the fewer credit and watch digests. There is no checkout yet, so Pro is set up by hand. The [pricing page](/pricing) has the numbers.',
   10),
  ('export-watermark',
   'Why does my export carry a fewer watermark?',
   'Below the Pro plan every export carries a small fewer credit: a linked logo on PNG and SVG, a credit line on the other formats. Pro removes it, and the toggle in the export panel turns it off.',
   20),
  ('different-from-file-manager',
   'How is this different from my file manager?',
   'A file manager opens one folder at a time and shows you a list. Fewer puts the whole tree on one canvas: search everything inside it, even files still zipped up, group and rename in bulk, re-lay it out, and export the result.',
   30),
  ('edit-directory',
   'Can fewer make changes to my directory?',
   'Not directly. Fewer does not write to the folders on your system: it reads a directory, lets you organise it on the canvas and export the result, and every change stays inside the graph until you export. Writing back to the real directory is not available in the browser build. The desktop version, which is work in progress, is where that will live.',
   40),
  ('how-big',
   'How big a folder can it handle?',
   'fewer handles folders in the thousands, and it has been tested with 5,000 of them on one canvas. We have run it up to 25,000 files, and it stays smooth: the canvas keeps up while you zoom, search and rearrange.',
   50),
  ('search-scope',
   'Does it search inside my files?',
   'It searches names and paths, including files inside zip, tar and other archives that were never unpacked. It does not read the text inside your files: nothing is uploaded and nothing is indexed on our side.',
   60),
  ('re-import',
   'Do I have to import my folder again?',
   'Yes, unless you save it. The canvas lives in the tab, so closing it loses the view. Save the graph to a free account to reopen it anywhere, or export it as JSON and import it back.',
   70)
on conflict (slug) do nothing;
