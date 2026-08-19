import { NextResponse } from "next/server";
import { runWatchDigest } from "@/lib/fewer/watchDigest";

/**
 * POST /api/watch/run
 * Manual/debug trigger for the nightly watch-digest job. The production
 * schedule lives in .github/workflows/watch-digest.yml (GitHub Actions cron,
 * 23:59 UTC) which runs scripts/watch-digest.ts directly — Netlify's 10s
 * free-tier function timeout can't fit a multi-index crawl. This route stays
 * as a thin, cron-secret-protected wrapper over the same shared job.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { users, emails } = await runWatchDigest();
    return NextResponse.json({ ok: true, users, emails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
