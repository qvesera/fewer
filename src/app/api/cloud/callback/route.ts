import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthedClient } from "@/lib/fewer/cloud/server";
import { getAdapter } from "@/lib/fewer/cloud/registry";
import { encryptToken } from "@/lib/fewer/cloud/crypto";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider") as CloudProvider | null;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("cloud_oauth_state")?.value;
  // Clear the state cookie regardless of outcome.
  cookieStore.delete("cloud_oauth_state");

  const bad = (msg: string) => NextResponse.redirect(`${origin}/?cloud=error&msg=${encodeURIComponent(msg)}`);

  if (!provider || !code) return bad("Missing OAuth parameters");
  if (error) return bad(`Provider denied: ${error}`);
  if (!state || state !== expectedState) return bad("OAuth state mismatch (try again)");

  const authed = await getAuthedClient();
  if (!authed) return bad("Not signed in");

  try {
    const adapter = await getAdapter(provider);
    const tok = await adapter.exchangeCode(code);

    const { supabase, user } = authed;
    const expiresAt = tok.expiresIn ? new Date(Date.now() + tok.expiresIn * 1000).toISOString() : null;

    const { data: existing, error: selErr } = await supabase
      .from("cloud_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("account_id", tok.accountId)
      .maybeSingle();

    const payload = {
      provider,
      account_id: tok.accountId,
      account_name: tok.accountName,
      access_token_enc: encryptToken(tok.accessToken),
      refresh_token_enc: tok.refreshToken ? encryptToken(tok.refreshToken) : null,
      expires_at: expiresAt,
      config: tok.config || {},
    };

    if (existing) {
      await supabase.from("cloud_connections").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("cloud_connections").insert({ ...payload, user_id: user.id });
    }

    return NextResponse.redirect(`${origin}/?cloud=connected&provider=${provider}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return bad(`Connection failed: ${msg}`);
  }
}