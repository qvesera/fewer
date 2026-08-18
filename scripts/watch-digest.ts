#!/usr/bin/env bun
/**
 * watch-digest.ts — CLI entry for the nightly watch-digest job.
 *
 * Run by .github/workflows/watch-digest.yml (GitHub Actions cron, 23:59 UTC).
 * Reads the same env vars as /api/watch/run (pushed to GitHub by
 * scripts/env-sync.ts) and calls the shared job in src/lib/fewer/watchDigest.ts.
 *
 * Local dry-run (point at the dev Supabase project):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   RESEND_API_KEY=... bun scripts/watch-digest.ts
 */
import { runWatchDigest } from "../src/lib/fewer/watchDigest";

try {
  const { users, emails } = await runWatchDigest();
  console.log(`Watch digest complete: ${users} user(s) with changes, ${emails} email(s) sent.`);
} catch (err) {
  console.error("Watch digest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
