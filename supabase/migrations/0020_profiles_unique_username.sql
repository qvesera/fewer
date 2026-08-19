-- 0020_profiles_unique_username.sql
-- Usernames must be unique across accounts. Enforced case-insensitively via a
-- partial unique index over lower(username); the WHERE clause lets any number
-- of users keep a blank/absent username while blocking duplicate handles.
drop index if exists profiles_username_unique_idx;
create unique index profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null and username <> '';