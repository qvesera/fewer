import { NextResponse } from "next/server";
import { getStripe, getAppUrl, getServiceSupabase, getAuthedUser, billingNotConfigured } from "@/lib/fewer/billing";

/**
 * POST /api/billing/portal
 * Opens the Stripe Customer Portal (manage card, invoices, cancel) and
 * returns { url }. Requires the account to have a stripe_customer_id
 * (i.e. went through checkout at least once) and a portal configuration
 * in the Stripe dashboard.
 */
export async function POST() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const stripe = getStripe();
  const service = getServiceSupabase();
  if (!stripe || !service) return billingNotConfigured();

  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account yet — upgrade to Pro first." },
      { status: 400 },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getAppUrl(),
  });
  return NextResponse.json({ url: session.url });
}
