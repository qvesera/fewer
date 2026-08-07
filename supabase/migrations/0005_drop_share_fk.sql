-- FKs on shared_graphs break inserts: Postgres validates FKs by SELECTing the
-- referenced row, but both referenced tables are RLS-protected from the anon
-- role (saved_graphs owner-only, auth.users hidden), so the FK check fails as
-- an RLS violation.
-- Ownership is already enforced server-side via the authed client; the columns
-- stay as plain uuid back-references.
alter table public.shared_graphs
  drop constraint if exists shared_graphs_saved_graph_id_fkey,
  drop constraint if exists shared_graphs_owner_id_fkey;