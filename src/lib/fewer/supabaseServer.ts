import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Build an authed Supabase client from the session cookie. Using the authed
 * client (not the anon key) attaches the user's JWT so RLS sees auth.uid() —
 * required for owner-scoped policies. Null when Supabase env is missing.
 */
export async function getSupabaseCookieClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
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
}

/**
 * Build an authed Supabase client and resolve the current user in one call.
 * Null when Supabase env is missing or the visitor is not signed in.
 * Routes use this to gate owner-scoped endpoints; each route decides the
 * appropriate HTTP status code (401 vs 403) for the null case.
 */
export async function getAuthedSupabase(): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}
