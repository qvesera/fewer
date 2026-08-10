-- Pin saved graphs to the top of the "Your Directories" list.
alter table public.saved_graphs
  add column if not exists is_favorite boolean not null default false;

create index if not exists saved_graphs_user_fav_idx
  on public.saved_graphs (user_id, is_favorite desc, updated_at desc);