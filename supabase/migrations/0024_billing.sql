-- 0024_billing.sql
-- Stripe billing: link a profiles row to its Stripe Customer. Like `plan`
-- (0022), this column is service-role-only — 0022 revoked table-level
-- INSERT/UPDATE from anon/authenticated and granted column-level privileges
-- only on (user_id, first_name, last_name, username), and privileges are
-- additive per column, so a column added here is writable by nobody except
-- the service role (and table owner). The webhook is the sole writer.
alter table public.profiles
  add column if not exists stripe_customer_id text;

-- One Stripe customer per account; partial so legacy NULLs don't collide.
create unique index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
