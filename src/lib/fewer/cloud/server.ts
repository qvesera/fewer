import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decryptToken } from "./crypto";
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
  const accessToken = decryptToken(connection.access_token_enc);
  return { connection, accessToken, supabase, user };
}