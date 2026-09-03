-- 0022_profiles_username_normalization.sql
-- Hardening for username uniqueness. The unique partial index (from 0020)
-- blocks case-insensitive duplicates, but only for values that are equal after
-- lower(). The API always stores trimmed + lowercased usernames, so the app
-- path is safe -- but any DIRECT db write (Supabase Studio, a service-role
-- script, a future admin flow) could store " foo " or "FOO", which would
-- sidestep a collision with "foo" (whitespace) or never be matchable at login
-- (uppercase, since /api/login lowercases the identifier first). These CHECK
-- constraints make the stored domain match what the app writes, so "unique"
-- means exactly one thing everywhere.

-- 1) Normalize any existing rows left over from before this guard. Safe no-op
--    when the column is already normalized; will fail loudly on conflicts.
update public.profiles
set username = lower(trim(username))
where username is not null
  and username <> ''
  and (username <> lower(username) or username <> trim(username));

-- 2) Re-assert the case-insensitive uniqueness index (same shape as 0020, so
--    this migration is self-sufficient even if 0020 is ever reordered).
drop index if exists profiles_username_unique_idx;
create unique index profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null and username <> '';

-- 3) Stored usernames must be normalized, so the unique index above is exact.
--    Postgres has no ADD CONSTRAINT IF NOT EXISTS, so guard with a DO block.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_no_outer_whitespace'
  ) then
    alter table public.profiles add constraint profiles_username_no_outer_whitespace
      check (username is null or username = '' or username = trim(username));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_lowercase'
  ) then
    alter table public.profiles add constraint profiles_username_lowercase
      check (username is null or username = '' or username = lower(username));
  end if;
end $$;