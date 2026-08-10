-- The SELECT policy must let the owner read their own rows. Without this,
-- INSERT ... RETURNING on an invite-only row fails for the owner because the
-- SELECT policy (public OR invited-email) rejects it when the owner isn't in
-- the invited list.
drop policy if exists "shared_graphs_select" on public.shared_graphs;
create policy "shared_graphs_select" on public.shared_graphs
  for select using (
    access = 'public'
    or owner_id = auth.uid()
    or (
      access = 'invite'
      and auth.jwt() ->> 'email' = any (invited_emails)
    )
  );