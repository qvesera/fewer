import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decryptToken, encryptToken } from "./crypto";
import { getAdapter } from "./registry";
import type { CloudConnection, CloudProvider } from "./types";

/** Authed Supabase client from the session cookie. Null when not signed in. */
export async function getAuthedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* ignore */
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase, user: data.user };
}

/** Fetch a connection row for the current user, decrypting its access token. */
export async function getConnectionWithToken(connectionId: string, provider: CloudProvider) {
  const authed = await getAuthedClient();
  if (!authed) throw new Error("Not signed in");
  const { supabase, user } = authed;

  const { data, error } = await supabase
    .from("cloud_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", provider)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Connection not found");

  const connection = data as CloudConnection & {
    access_token_enc: string;
    refresh_token_enc: string | null;
    expires_at: string | null;
  };

  // Refresh the access token if it expires within the next minute.
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt !== null && expiresAt < Date.now() + 60_000) {
    if (!connection.refresh_token_enc) {
      throw new Error("Cloud token expired — unlink the account and connect it again.");
    }
    const adapter = await getAdapter(provider);
    const refreshed = await adapter.refreshToken(decryptToken(connection.refresh_token_enc));
    if (!refreshed) {
      throw new Error("Cloud token expired — unlink the account and connect it again.");
    }
    const newExpiry = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
      : null;
    await supabase
      .from("cloud_connections")
      .update({ access_token_enc: encryptToken(refreshed.accessToken), expires_at: newExpiry })
      .eq("id", connection.id);
    return { connection, accessToken: refreshed.accessToken, supabase, user };
  }

  const accessToken = decryptToken(connection.access_token_enc);
  return { connection, accessToken, supabase, user };
}
