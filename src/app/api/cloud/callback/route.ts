import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthedClient } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import { encryptToken } from "@/lib/fewer/cloud/crypto";
import type { CloudProvider } from "@/lib/fewer/cloud/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("cloud_oauth_state")?.value;
  // Providers only echo `code` + `state`, so the provider comes from the cookie
  // set by /api/cloud/connect.
  const provider = (cookieStore.get("cloud_oauth_provider")?.value ?? null) as CloudProvider | null;
  // Clear the flow cookies regardless of outcome.
  cookieStore.delete("cloud_oauth_state");
  cookieStore.delete("cloud_oauth_provider");

  const bad = (msg: string) => NextResponse.redirect(`${origin}/?cloud=error&msg=${encodeURIComponent(msg)}`);

  if (!provider || !code) return bad("Missing OAuth parameters");
  if (error) return bad(`Provider denied: ${error}`);
  if (!state || state !== expectedState) return bad("OAuth state mismatch (try again)");

  const authed = await getAuthedClient();
  if (!authed) return bad("Not signed in");

  try {
    await persistConnection(authed.supabase, provider, authed.user.id, code);
    return NextResponse.redirect(`${origin}/?cloud=connected&provider=${provider}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return bad(`Connection failed: ${msg}`);
  }
}

/** Exchange the OAuth code for tokens and upsert the connection row (one row
 *  per user + provider + account, so reconnecting refreshes in place). */
async function persistConnection(
  supabase: SupabaseClient,
  provider: CloudProvider,
  userId: string,
  code: string,
): Promise<void> {
  const adapter = await getAdapter(provider);
  const tok = await adapter.exchangeCode(code);

  const { data: existing } = await supabase
    .from("cloud_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("account_id", tok.accountId)
    .maybeSingle();

  const payload = {
    provider,
    account_id: tok.accountId,
    account_name: tok.accountName,
    access_token_enc: encryptToken(tok.accessToken),
    refresh_token_enc: tok.refreshToken ? encryptToken(tok.refreshToken) : null,
    expires_at: tok.expiresIn ? new Date(Date.now() + tok.expiresIn * 1000).toISOString() : null,
    config: tok.config || {},
  };

  if (existing) {
    await supabase.from("cloud_connections").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("cloud_connections").insert({ ...payload, user_id: userId });
  }
}