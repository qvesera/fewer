-- 0022_account_plans.sql
-- Account plan (free | pro). The column is service-role-only: profiles RLS
-- lets users update their own row (Settings → Account), so column-level
-- revokes stop a signed-in user from flipping themselves to pro via the REST
-- API. Plans change only via the service role (billing webhook / dashboard).
alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'pro'));

-- Make plan service-role-only. Plain column revokes don't work here: Supabase
-- grants table-level ALL to anon/authenticated, and table-level privileges
-- override nothing (privileges are additive). So: revoke table-level
-- INSERT/UPDATE, then grant column-level on every column except plan.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (user_id, first_name, last_name, username) on public.profiles to anon, authenticated;
grant update (first_name, last_name, username) on public.profiles to anon, authenticated;