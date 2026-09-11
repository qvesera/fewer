import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decryptToken, encryptToken } from "./crypto";
import { getAdapter } from "./registry";
import type { CloudConnection, CloudProvider } from "./types";
import { isTokenExpiringSoon } from "./tokenExpiry";

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
  if (isTokenExpiringSoon(connection.expires_at)) {
    const accessToken = await refreshAccessToken(supabase, provider, connection);
    return { connection, accessToken, supabase, user };
  }

  const accessToken = decryptToken(connection.access_token_enc);
  return { connection, accessToken, supabase, user };
}

type AuthedClient = NonNullable<Awaited<ReturnType<typeof getAuthedClient>>>;

/** Refresh the access token via the provider adapter and persist the new one.
 *  Throws with an actionable message when the refresh token is missing or the
 *  provider rejects the refresh. */
async function refreshAccessToken(
  supabase: AuthedClient["supabase"],
  provider: CloudProvider,
  connection: { id: string; refresh_token_enc: string | null },
): Promise<string> {
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
  return refreshed.accessToken;
}
