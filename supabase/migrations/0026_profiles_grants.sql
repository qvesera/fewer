-- 0026_profiles_grants.sql
--
-- Restore the column-level privilege model on public.profiles.
--
-- History:
--   0022 (account_plans) deliberately did
--     revoke insert, update on public.profiles from anon, authenticated;
--     grant insert (user_id, first_name, last_name, username) ... ;
--     grant update (first_name, last_name, username) ... ;
--   so a signed-in user cannot flip their own `plan` to pro over PostgREST.
--   RLS gates rows, not columns: a user may update their own row, so
--   table-level UPDATE would make EVERY column writable — including `plan`
--   and `stripe_customer_id`.
--
--   The v0.7.0 release then edited 0019_profiles.sql to add
--     grant select on public.profiles to anon;
--     grant select, insert, update, delete on public.profiles to authenticated;
--   as a workaround for a "permission denied for table profiles" error. That
--   workaround was a security regression, and because 0019 had already been
--   applied it never ran through the migration runner — the grants reached
--   production only by being applied out-of-band, re-opening the hole.
--
-- The application needs far less than that. Every profile write from the user
-- session is the Settings → Account upsert in /api/profile, which writes only
-- (user_id, first_name, last_name, username); `updated_at` is maintained by the
-- profiles_set_updated_at trigger, and `plan` / `stripe_customer_id` are
-- written exclusively by the service role (billing checkout + webhook), which
-- bypasses these grants entirely.
--
-- Idempotent: revoke-then-grant is safe to re-run on any environment, whether
-- it inherited the regression or not.

revoke insert, update on public.profiles from anon, authenticated;

-- SELECT (own row) — normally a Supabase default; granted explicitly so the
-- model does not depend on those defaults.
grant select on public.profiles to anon, authenticated;

-- Insert/update only the columns the account form owns.
grant insert (user_id, first_name, last_name, username) on public.profiles to anon, authenticated;
grant update (first_name, last_name, username) on public.profiles to anon, authenticated;
