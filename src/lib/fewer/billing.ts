// Server-side Stripe billing helpers. Every /api/billing/* route first checks
// the BILLING_ENABLED feature flag — while it is off (the default) routes
// return 503 and no plan is ever written; account levels are assigned
// directly in the database (profiles.plan, service-role-only — migrations
// 0022/0023). When the flag is on, the routes additionally require
// STRIPE_SECRET_KEY / STRIPE_PRO_PRICE_ID / STRIPE_WEBHOOK_SECRET and return
// 503 without them instead of half-working. The webhook then syncs plan from
// subscription status; never trust a success_url redirect.
import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthedSupabase } from "@/lib/fewer/supabaseServer";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/**
 * Master feature flag for the payment gateway. "false" (the default) keeps
 * payments switched off: /api/billing/* return 503 and the client hides all
 * upgrade/checkout UI. Flip to "true" (plus the Stripe env vars) to turn
 * self-serve billing on.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
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

/**
 * Resolve the signed-in user from the session cookie (null = signed out / unconfigured).
 * Delegates to the shared supabaseServer helper.
 */
export async function getAuthedUser() {
  const authed = await getAuthedSupabase();
  return authed?.user ?? null;
}

/** 503 body returned while the BILLING_ENABLED feature flag is switched off. */
export function billingDisabled(): Response {
  return Response.json({ error: "Billing is disabled on this server" }, { status: 503 });
}

/** 503 body shared by the billing routes when Stripe env vars are unset. */
export function billingNotConfigured(): Response {
  return Response.json({ error: "Billing is not configured on this server" }, { status: 503 });
}
