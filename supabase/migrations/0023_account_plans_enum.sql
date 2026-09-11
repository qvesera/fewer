-- 0023_account_plans_enum.sql
-- profiles.plan becomes a native enum (free | pro | team). The 0022 check
-- constraint is redundant with the enum's value set and must be dropped
-- *before* the type conversion: re-validating `plan = ANY(ARRAY[...text])`
-- against an enum column fails (no plan=text operator).
-- Guarded for idempotency (type may already exist, e.g. created in dashboard).
do $$ begin
  create type public.plan as enum ('free', 'pro', 'team');
exception when duplicate_object then null; end $$;

alter table public.profiles drop constraint if exists profiles_plan_check;

alter table public.profiles
  alter column plan drop default,
  alter column plan type public.plan using plan::public.plan,
  alter column plan set default 'free'::public.plan;
