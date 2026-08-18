-- Public gallery listing.
-- Opt-in metadata on shared_graphs rows: when a logged-in owner publishes a
-- public share to the gallery, it becomes reachable from /api/gallery (browsed
-- logged-out via the existing public RLS select policy). Unshare deletes the
-- row, which instantly delists it.
alter table public.shared_graphs
  add column if not exists in_gallery boolean not null default false,
  add column if not exists gallery_title text,
  add column if not exists gallery_description text,
  add column if not exists node_count int not null default 0;

-- Gallery rows must be public, owned, and never invite-only.
alter table public.shared_graphs
  drop constraint if exists shared_graphs_gallery_check;

alter table public.shared_graphs
  add constraint shared_graphs_gallery_check
    check ( in_gallery = false or (access = 'public' and owner_id is not null) );

create index if not exists shared_graphs_gallery_idx
  on public.shared_graphs (created_at desc)
  where in_gallery = true and access = 'public';