import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import { randomState } from "@/lib/fewer/cloud/oauth";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider") as CloudProvider | null;
  if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });

  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Cloud connectors are a Pro feature (server-stored OAuth tokens have real
  // hosting cost). Surfaced via the same cloud=error redirect the UI shows for
  // unconfigured providers.
  const limits = limitsFor(await getUserPlan(authed.supabase, authed.user.id));
  if (!limits.cloudConnections) {
    return NextResponse.redirect(
      `${origin}/?cloud=error&msg=${encodeURIComponent(
        "Cloud connections are a Pro feature. Public imports (URL, GitHub, local disk) stay free.",
      )}`
    );
  }

  const adapter = await getAdapter(provider);
  const state = randomState();

  let url: string;
  try {
    url = await adapter.buildAuthUrl(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Provider not configured";
    return NextResponse.redirect(`${origin}/?cloud=error&msg=${encodeURIComponent(msg)}`);
  }

  // Store state in a httpOnly cookie so the callback can verify it (CSRF).
  // Providers only echo `code` + `state` back, so carry `provider` in a cookie too.
  const res = NextResponse.redirect(url);
  res.cookies.set("cloud_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set("cloud_oauth_provider", provider, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
