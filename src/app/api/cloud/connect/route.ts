import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import { randomState } from "@/lib/fewer/cloud/oauth";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider") as CloudProvider | null;
  if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });

  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
  const res = NextResponse.redirect(url);
  res.cookies.set("cloud_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
