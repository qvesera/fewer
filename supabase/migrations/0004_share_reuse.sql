-- One active share per owner + saved graph.
-- "Generate link" reuses the same row (stable link) instead of inserting
-- duplicates. Unshare deletes the row.
--
-- First dedupe any existing duplicates (keep the most recent row per
-- owner + saved graph), then add the unique index.

delete from public.shared_graphs a
using public.shared_graphs b
where a.owner_id = b.owner_id
  and a.saved_graph_id = b.saved_graph_id
  and a.owner_id is not null
  and a.saved_graph_id is not null
  and a.created_at < b.created_at;

create unique index if not exists shared_graphs_owner_graph_idx
  on public.shared_graphs (owner_id, saved_graph_id)
  where owner_id is not null and saved_graph_id is not null;