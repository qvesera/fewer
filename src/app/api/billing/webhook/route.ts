import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getServiceSupabase, billingDisabled, billingEnabled } from "@/lib/fewer/billing";
import { applyCheckoutCompleted, applySubscriptionChange } from "@/lib/fewer/billingWebhook";

/**
 * POST /api/billing/webhook
 * The sole writer of profiles.plan. Verifies the raw-body signature, then
 * dispatches to the handler functions in billingWebhook.ts which are
 * testable with a mock Supabase client.  Returns 500 on DB error so
 * Stripe retries the event.
 */
export async function POST(request: Request) {
  if (!billingEnabled()) return billingDisabled();
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const service = getServiceSupabase();
  if (!stripe || !secret || !service) {
    return NextResponse.json({ error: "Billing is not configured on this server" }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await applyCheckoutCompleted(service, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscriptionChange(service, event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
