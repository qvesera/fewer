/**
 * Pure helpers for the Stripe billing webhook.
 * Extracted from the route so the business logic is testable without Next.js
 * or a real Supabase client.
 */
import type Stripe from "stripe";

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
