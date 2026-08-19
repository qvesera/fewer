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

revoke insert (plan) on public.profiles from anon, authenticated;
revoke update (plan) on public.profiles from anon, authenticated;