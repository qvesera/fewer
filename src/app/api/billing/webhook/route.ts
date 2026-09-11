import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getServiceSupabase, billingDisabled, billingEnabled } from "@/lib/fewer/billing";

/**
 * POST /api/billing/webhook
 * The sole writer of profiles.plan. Verifies the raw-body signature, then:
 *  - checkout.session.completed → link stripe_customer_id + set plan pro
 *    (a completed subscription checkout means payment succeeded)
 *  - customer.subscription.created/updated/deleted → plan follows the
 *    subscription status (active/trialing/past_due = pro, else free)
 * Responds 2xx for known-but-unhandled events; never trust anything the
 * client says about plan state.
 */

// Subscription statuses that grant Pro. past_due keeps Pro as a grace
// period — Stripe retries, then cancels (which fires .deleted → free).
const PRO_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

export async function POST(request: Request) {
  if (!billingEnabled()) return billingDisabled();
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const service = getServiceSupabase();
  if (!stripe || !secret || !service) {
    return NextResponse.json({ error: "Billing is not configured on this server" }, { status: 503 });
  }

  // Raw body is required for signature verification — read before any JSON parse.
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        if (userId && customerId) {
          // Upsert (row may not exist yet); onConflict updates only these columns.
          const { error } = await service.from("profiles").upsert(
            { user_id: userId, stripe_customer_id: customerId, plan: "pro" },
            { onConflict: "user_id" },
          );
          if (error) throw new Error(error.message);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        if (customerId) {
          const plan = PRO_STATUSES.has(sub.status) ? "pro" : "free";
          const { error } = await service
            .from("profiles")
            .update({ plan })
            .eq("stripe_customer_id", customerId);
          if (error) throw new Error(error.message);
        }
        break;
      }

      default:
        // Unsubscribed event type — ack so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries — a dropped event would desync plan state.
    const msg = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
