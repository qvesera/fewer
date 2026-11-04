import { NextResponse } from "next/server";
import { serverError } from "@/lib/fewer/apiHelpers";
import { planChangeRecordId, runPlanChangeNotify } from "@/lib/fewer/planChangeNotify";

/**
 * POST /api/plan/notify
 * Instant path for plan-change emails. A Supabase Database Webhook on
 * plan_change_events INSERT calls this (see content/docs/deployment.md);
 * the 15-min Actions cron is the fallback for anything it misses.
 *
 * The `x-cron-secret` header is the same shared secret as /api/watch/run —
 * the payload itself is only used for the row id, which is re-read from the
 * table before anything is sent. Never 500 on a missing/bogus body: a webhook
 * that reports success does not get retried into a mail storm.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const id = planChangeRecordId(body);
  if (id === null) {
    return NextResponse.json({ ok: true, skipped: "no record id" });
  }

  try {
    const result = await runPlanChangeNotify({ id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return serverError(err);
  }
}
