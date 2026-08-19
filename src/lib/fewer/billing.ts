// Server-side Stripe billing helpers. All /api/billing/* routes are
// env-guarded: without STRIPE_SECRET_KEY / STRIPE_PRO_PRICE_ID /
// STRIPE_WEBHOOK_SECRET they return 503 instead of half-working.
// profiles.plan is service-role-only (migrations 0022/0023) — the webhook
// is the sole writer; never trust a success_url redirect.
import "server-only";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

export function getProPriceId(): string | null {
  return process.env.STRIPE_PRO_PRICE_ID ?? null;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/** Service-role client — bypasses RLS so the webhook can write profiles.plan. */
export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Resolve the signed-in user from the session cookie (null = signed out / unconfigured). */
export async function getAuthedUser() {
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
  return data.user ?? null;
}

/** 503 body shared by the billing routes when Stripe env vars are unset. */
export function billingNotConfigured(): Response {
  return Response.json({ error: "Billing is not configured on this server" }, { status: 503 });
}
