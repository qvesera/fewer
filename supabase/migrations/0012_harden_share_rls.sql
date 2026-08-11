-- Tighten shared_graphs UPDATE/DELETE RLS.
--
-- The original policies (0003) were `using (true)` for every role. The anon
-- publishable key ships in the browser bundle, so anyone could overwrite or
-- delete ANY share row directly via the Supabase REST API — e.g. overwrite a
-- logged-in user's invite-only share with their own payload.
--
-- New rules:
--   * Owners manage their own rows. Reuse-update and unshare already ran as
--     the authed client and filtered by owner_id — now the DB enforces it too.
--   * Anonymous rows (owner_id is null) stay manageable so the server's lazy
--     expiry delete (anon client in /api/share/[id]) keeps working.
--   * Anon/other users can no longer touch owned rows.
--
-- Note: expired OWNED rows are no longer deletable via the anon lazy-cleanup
-- path (RLS denies it) — they still 404 on read, and the owner can remove them
-- with "Stop sharing". The invite-token cleanup in 0009 is a SECURITY DEFINER
-- function, so it bypasses RLS and keeps deleting expired rows regardless.

drop policy if exists "shared_graphs_update" on public.shared_graphs;
create policy "shared_graphs_update" on public.shared_graphs
  for update
  using (owner_id = auth.uid() or owner_id is null)
  with check (owner_id = auth.uid() or owner_id is null);

drop policy if exists "shared_graphs_delete" on public.shared_graphs;
create policy "shared_graphs_delete" on public.shared_graphs
  for delete using (owner_id = auth.uid() or owner_id is null);