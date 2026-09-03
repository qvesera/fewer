import { NextResponse } from "next/server";
import { getStripe, getProPriceId, getAppUrl, getServiceSupabase, getAuthedUser, billingNotConfigured, billingEnabled, billingDisabled } from "@/lib/fewer/billing";

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for the Pro subscription (€7/mo) and
 * returns { url } for the client to redirect to. Creates + stores the
 * Stripe Customer on first upgrade (profiles.stripe_customer_id).
 * Plan changes happen ONLY via the webhook — the success redirect proves
 * nothing.
 */
export async function POST() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!billingEnabled()) return billingDisabled();

  const stripe = getStripe();
  const price = getProPriceId();
  const service = getServiceSupabase();
  if (!stripe || !price || !service) return billingNotConfigured();

  // Find (or create) the Stripe Customer for this account.
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      // Upsert: the profiles row may not exist yet (created lazily on first
      // profile save). onConflict updates only this column on existing rows.
      const { error } = await service
        .from("profiles")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create billing customer";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const appUrl = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${appUrl}/app?billing=success`,
    cancel_url: `${appUrl}/app?billing=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
