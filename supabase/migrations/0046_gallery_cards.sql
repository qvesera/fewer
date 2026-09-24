-- 0046_gallery_cards.sql
-- Gallery card metadata: author attribution, category, and preview.
-- Mirrors the shared_themes attribution pattern from 0031.

alter table public.shared_graphs
  add column if not exists author_name text,
  add column if not exists author_username text,
  add column if not exists gallery_category text,
  add column if not exists gallery_categories jsonb,
  add column if not exists gallery_preview jsonb;

create index if not exists shared_graphs_gallery_category_idx
  on public.shared_graphs (gallery_category)
  where in_gallery = true;
