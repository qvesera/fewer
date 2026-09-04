#!/usr/bin/env bun
/**
 * purge-deleted-accounts.ts — CLI entry for the nightly account-purge job.
 *
 * Run by .github/workflows/purge-deleted-accounts.yml (GitHub Actions cron).
 * Reads the same env vars as /api/account (pushed to GitHub by
 * scripts/env-sync.ts) and calls the shared job in
 * src/lib/fewer/accountDeletion.ts, which clears the deletion marker for
 * users who signed back in and permanently purges the rest.
 *
 * Local dry-run (point at the dev Supabase project):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   bun scripts/purge-deleted-accounts.ts
 */
import { purgeDueAccounts } from "../src/lib/fewer/accountDeletion";

try {
  const { recovered, purged, errors } = await purgeDueAccounts();
  console.log(
    `Account purge complete: ${recovered} account(s) recovered, ${purged} purged, ${errors.length} error(s).`,
  );
  for (const e of errors) console.error(`  ${e}`);
  if (errors.length > 0) process.exit(1);
} catch (err) {
  console.error("Account purge failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}