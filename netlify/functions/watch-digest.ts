import type { Handler } from "@netlify/functions";

/**
 * Netlify scheduled function — runs daily at 23:59 UTC.
 * Triggers the app's /api/watch/run job with the cron secret.
 */
export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.fewer.directory";

  if (!secret) {
    return { statusCode: 500, body: "CRON_SECRET not set" };
  }

  try {
    const res = await fetch(`${appUrl}/api/watch/run`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    return { statusCode: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { statusCode: 500, body: msg };
  }
};