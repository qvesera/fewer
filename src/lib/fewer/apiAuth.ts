import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Shared authenticated Supabase client for per-user API routes (profile,
 * settings, share).  Reads the session cookie created by Supabase Auth's
 * server helper and returns a short-lived client + the authenticated user,
 * or null when not signed in / env is missing.
 *
 * Both `src/app/api/profile/route.ts` and `src/app/api/settings/route.ts`
 * previously duplicated this 23-line block verbatim.
 */
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* ignore — next/headers throws in read-only contexts (e.g. Route Handlers without response) */
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase, user: data.user };
}
