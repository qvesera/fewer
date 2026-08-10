-- The invite-token route resolves a token -> share_id, then reads the graph.
-- That read runs as the anon role, but the SELECT policy requires an invited
-- email in the JWT, so anonymous viewers got "Share not found".
--
-- Fix: a SECURITY DEFINER function fetches the graph by token. The token is
-- the credential; RLS is bypassed only for this token-keyed lookup, and the
-- SELECT policy stays strict (no loosening for the anon role).

create or replace function public.get_shared_graph_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_id text;
  v_data jsonb;
  v_expires_at timestamptz;
begin
  select i.share_id into v_share_id
  from public.share_invites i
  where i.token = p_token;

  if v_share_id is null then
    return null;
  end if;

  -- Mark used (idempotent).
  update public.share_invites
  set used_at = now()
  where token = p_token and used_at is null;

  select s.data, s.expires_at into v_data, v_expires_at
  from public.shared_graphs s
  where s.id = v_share_id;

  if v_data is null then
    return null;
  end if;

  -- Lazy expiry.
  if v_expires_at < now() then
    delete from public.shared_graphs where id = v_share_id;
    return null;
  end if;

  return v_data;
end;
$$;

revoke all on function public.get_shared_graph_by_token(text) from public;
grant execute on function public.get_shared_graph_by_token(text) to anon, authenticated;