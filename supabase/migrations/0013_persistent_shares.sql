-- Owner (logged-in) shares never expire. A NULL expires_at means "no expiry".
-- Anonymous shares keep the 30-day TTL set in app code.
alter table public.shared_graphs
  alter column expires_at drop not null;