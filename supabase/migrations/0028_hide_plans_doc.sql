-- 0028_hide_plans_doc.sql
--
-- Self-serve billing has NOT been tested end to end yet, so the billing surface
-- stays hidden. The runtime gate is the BILLING_ENABLED feature flag (default
-- off: /api/billing/* return 503 and the client hides the upgrade UI), but the
-- Plans docs page advertises the Pro/Team tiers and prices, and it is plain
-- content that no flag covers.
--
-- Hiding it is a publish toggle, not a schema change: the row stays in
-- content_pages and profiles.plan is still assigned directly by the service
-- role (migrations 0022/0023). Both /docs routes filter on published = true, so
-- an unpublished page is unreachable.
--
-- Re-publish this row (and restore the in-app links to /docs/plans, which were
-- repointed to /docs/accounts at the same time) once billing is tested.
--
-- content/docs/plans.md stays in the repo as the source of record for the copy.
--
-- Idempotent.
update public.content_pages
   set published = false
 where type = 'docs'
   and slug = 'plans';
