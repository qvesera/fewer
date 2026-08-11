-- Drop the owner_id FK -> auth.users. Postgres validates FKs by SELECTing the
-- referenced row, but auth.users is RLS-hidden from the anon role, so inserts
-- with owner_id set fail as an RLS violation. Ownership is enforced server-side
-- via the authed client; owner_id stays a plain uuid back-reference.
alter table public.shared_graphs
  drop constraint if exists shared_graphs_owner_id_fkey;