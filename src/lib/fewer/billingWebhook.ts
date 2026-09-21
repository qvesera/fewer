/**
 * Pure helpers for the Stripe billing webhook.
 * Extracted from the route so the business logic is testable without Next.js
 * or a real Supabase client.
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Subscription statuses that grant Pro. past_due keeps Pro as a grace
// period — Stripe retries, then cancels (which fires .deleted → free).
const PRO_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
  "past_due",
]);

/** Map subscription status to plan name. */
export function planFromSubscription(
  status: Stripe.Subscription.Status,
): "pro" | "free" {
  return PRO_STATUSES.has(status) ? "pro" : "free";
}

/**
 * Extract a Stripe customer ID from a checkout session or subscription's
 * `customer` field.  Stripe represents this as either a plain string or an
 * expanded object with an `id` property; unconfigured/missing events yield
 * `null`.
 */
export function extractCustomerId(
  customer: string | { id?: string | null } | null | undefined,
): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

/**
 * Handle a `checkout.session.completed` event: link the Stripe customer ID
 * to the user's profile and set plan to pro.  Throws on DB error so the
 * route can return 500 and Stripe retries.
 */
export async function applyCheckoutCompleted(
  service: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id;
  const customerId = extractCustomerId(session.customer);
  if (!userId || !customerId) return;

  const { error } = await service.from("profiles").upsert(
    { user_id: userId, stripe_customer_id: customerId, plan: "pro" },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

/**
 * Handle subscription created/updated/deleted: map status to plan and update
 * the profile by Stripe customer ID.  Throws on DB error so the route can
 * return 500 and Stripe retries.
 */
export async function applySubscriptionChange(
  service: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const customerId = extractCustomerId(sub.customer);
  if (!customerId) return;

  const { error } = await service
    .from("profiles")
    .update({ plan: planFromSubscription(sub.status) })
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
}
