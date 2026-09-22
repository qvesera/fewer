-- 0038_profiles_name_from_oauth_metadata.sql
-- Auto-fill first_name / last_name in profiles from OAuth provider metadata.
--
-- Problem: handle_new_user() (0025) creates a profiles row on signup but only
-- sets (user_id, plan). Users who sign up via Google or GitHub leave
-- first_name / last_name empty even though raw_user_meta_data carries a
-- display name — visible in Settings → Account but never prefilled.
--
-- Fix:
--   1) profile_names_from_metadata() — immutable helper that extracts a
--      (first_name, last_name) pair from raw_user_meta_data. Precedence:
--        a) given_name + family_name  (Google legacy shape)
--        b) full_name (Supabase normalised) → split on first whitespace
--        c) name      (fallback key)
--      Both outputs are trimmed, whitespace-collapsed, and capped at 100
--      chars (matching the app's validateTextField max: 100).
--
--   2) handle_new_user() — create-or-replace: same trigger body as 0025
--      plus the two new columns.
--
--   3) One-time backfill: updates existing profiles where both names are
--      still blank. Idempotent; never overwrites a name the user typed.
--
-- Not covered: a user who signs up with email (no name in metadata) and
-- later links Google/GitHub — the auth.users row already exists so the
-- insert trigger does not fire. That user types their name in Settings →
-- Account, which is the existing UX.
--
-- Username is NOT auto-filled from user_name / preferred_username because
-- profiles_username_unique_idx would turn a collision into a 23505 inside
-- the security-definer trigger, breaking signup entirely.

-- ── Part A: helper ──────────────────────────────────────────────────────────

create or replace function public.profile_names_from_metadata(meta jsonb)
returns table (first_name text, last_name text)
language sql
immutable
set search_path = ''
as $$
  with cleaned as (
    select
      nullif(regexp_replace(
        coalesce(meta->>'given_name', ''),
        '\s+', ' ', 'g'
      ), '') as given,
      nullif(regexp_replace(
        coalesce(meta->>'family_name', ''),
        '\s+', ' ', 'g'
      ), '') as family,
      nullif(regexp_replace(
        coalesce(meta->>'full_name', meta->>'name', ''),
        '\s+', ' ', 'g'
      ), '') as full
  )
  select
    nullif(left(coalesce(trim(given), split_part(full, ' ', 1)), 100), ''),
    nullif(left(
      coalesce(
        trim(family),
        nullif(trim(substr(full, length(split_part(full, ' ', 1)) + 1)), '')
      ),
      100
    ), '')
  from cleaned;
$$;

revoke execute on function public.profile_names_from_metadata(jsonb) from public;

-- ── Part B: update handle_new_user() ─────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n record;
begin
  select * into n
    from public.profile_names_from_metadata(new.raw_user_meta_data);

  insert into public.profiles (user_id, plan, first_name, last_name)
  values (new.id, 'free'::public.plan, n.first_name, n.last_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

-- ── Part C: one-time backfill ───────────────────────────────────────────────
-- Fills ONLY profiles where both names are blank. Email users have no name
-- metadata so they are never touched. Idempotent: second run matches 0 rows.

update public.profiles p
   set first_name = n.first_name,
       last_name  = n.last_name
  from auth.users u
  cross join lateral public.profile_names_from_metadata(u.raw_user_meta_data) n
 where p.user_id = u.id
   and coalesce(p.first_name, '') = ''
   and coalesce(p.last_name,  '') = ''
   and (n.first_name is not null or n.last_name is not null);
