-- 0025_profiles_backfill_and_signup_trigger.sql
-- Problem: profiles row is only created when a user saves Settings → Account.
-- No row = no plan column = billing & plan-gated features break.
--
-- Fix:
--   1) Backfill a profiles row (plan = 'free') for every existing auth user
--      who doesn't already have one.  Idempotent — ON CONFLICT DO NOTHING.
--   2) Trigger on auth.users so every future signup gets a row automatically.

-- ── Part A: backfill existing users ────────────────────────────────────────
insert into public.profiles (user_id, plan)
select u.id, 'free'::public.plan
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
)
on conflict (user_id) do nothing;

-- ── Part B: auto-create profile on signup ──────────────────────────────────
-- security definer: trigger fires as supabase_auth_admin which has no rights
-- on public.profiles.  The definer (postgres) bypasses that.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, plan)
  values (new.id, 'free'::public.plan)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
