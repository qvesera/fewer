import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function assertEnv() {
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  }
}

/**
 * Server-side Supabase client for API routes.
 * Uses the publishable key (RLS-protected). No auth/session needed for
 * anonymous reads; auth is enforced via RLS + the user's JWT when present.
 */
export function getSupabase() {
  assertEnv();
  return createSupabaseClient(url!, key!);
}

/**
 * Browser-side Supabase client with cookie-based session persistence.
 * Used for auth (sign in/up/out) and authenticated data access.
 */
export function getBrowserSupabase() {
  assertEnv();
  return createBrowserClient(url!, key!);
}