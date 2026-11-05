#!/usr/bin/env bun
/**
 * plan-change-notify.ts — CLI entry for the plan-change email sweep.
 *
 * Run by .github/workflows/plan-change-notify.yml (cron every 15 min).
 * Reads the same env vars as the watch-digest job (pushed to GitHub by
 * scripts/env-sync.ts) and calls the shared job in
 * src/lib/fewer/planChangeNotify.ts. The instant path is the Supabase
 * Database Webhook → POST /api/plan/notify; this sweep only catches what
 * that webhook missed.
 *
 * Local dry-run (point at the dev Supabase project):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   RESEND_API_KEY=... bun scripts/plan-change-notify.ts
 */
import { runPlanChangeNotify } from "../src/lib/fewer/planChangeNotify";

try {
  const { sent, failed, skipped } = await runPlanChangeNotify();
  console.log(`Plan change emails: ${sent} sent, ${failed} failed, ${skipped} skipped.`);
} catch (err) {
  console.error("Plan change emails failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
