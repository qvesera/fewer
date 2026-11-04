-- 0057_plan_change_events.sql
--
-- Plan-change email notifications. Every write to profiles.plan — the Stripe
-- billing webhook (src/lib/fewer/billingWebhook.ts) or operator SQL in
-- Supabase Studio (the documented way to change a plan while BILLING_ENABLED
-- is off) — lands in this outbox first, so one mechanism covers both writers.
-- An app-level hook in the webhook would see neither of them today.
--
-- Consumers (both call runPlanChangeNotify in src/lib/fewer/planChangeNotify.ts):
--   1. instant: a Supabase Database Webhook on INSERT here → POST
--      /api/plan/notify (x-cron-secret). Manual setup, see content/docs/deployment.md.
--   2. safety net: .github/workflows/plan-change-notify.yml (cron */15) →
--      scripts/plan-change-notify.ts. Catches anything the webhook missed.
--
-- `email` is copied from auth.users at trigger time (profiles has no email
-- column): it is the address on file when the plan changed, and it avoids an
-- admin API listing that only reads its first page.
--
-- Idempotent: table and index use `if not exists`, the function and triggers
-- are replaced.

create table if not exists public.plan_change_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text,
  from_plan   public.plan,
  to_plan     public.plan not null,
  changed_at  timestamptz not null default now(),
  claimed_at  timestamptz,           -- set while a send is in flight
  sent_at     timestamptz,           -- terminal: emailed (or deliberately skipped)
  attempts    int not null default 0,
  last_error  text
);

-- Pending sweep: `where sent_at is null` keeps the index tiny.
create index if not exists plan_change_events_pending_idx
  on public.plan_change_events (id)
  where sent_at is null;

-- Holds email addresses: service-role only, no RLS policies by design.
alter table public.plan_change_events enable row level security;
revoke all on public.plan_change_events from anon, authenticated;

-- ── The trigger ─────────────────────────────────────────────────────────────
-- security definer: the writer may be the service role (webhook) or a Studio
-- session; the definer (postgres) reads auth.users either way.
create or replace function public.log_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.plan;
begin
  if tg_op = 'UPDATE' then
    -- `is distinct from`: a Stripe status churn that does not move the plan
    -- (trialing → active, past_due → active) is not a plan change.
    if old.plan is distinct from new.plan then
      v_from := old.plan;
    else
      return new;
    end if;
  else
    -- INSERT: only a row created above 'free' is a change (the checkout
    -- upsert in applyCheckoutCompleted writes plan = 'pro' directly).
    if new.plan = 'free'::public.plan then
      return new;
    end if;
    v_from := null;
  end if;

  insert into public.plan_change_events (user_id, email, from_plan, to_plan)
  values (
    new.user_id,
    (select u.email from auth.users u where u.id = new.user_id),
    v_from,
    new.plan
  );
  return new;
end;
$$;

revoke execute on function public.log_plan_change() from public;

drop trigger if exists profiles_plan_changed on public.profiles;
create trigger profiles_plan_changed
  after update on public.profiles
  for each row
  when (old.plan is distinct from new.plan)
  execute function public.log_plan_change();

drop trigger if exists profiles_plan_created_pro on public.profiles;
create trigger profiles_plan_created_pro
  after insert on public.profiles
  for each row
  when (new.plan <> 'free'::public.plan)
  execute function public.log_plan_change();
