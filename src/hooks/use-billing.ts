"use client";

import { useCallback, useState } from "react";

/**
 * Stripe billing actions for the client: redirect to Pro checkout or to the
 * customer portal. Both POST to /api/billing/* which return a Stripe-hosted
 * { url }; the actual page navigates away from the app.
 */
export function useBilling() {
  const [loading, setLoading] = useState(false);

  const go = useCallback(async (path: string, fallbackError: string): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json.url === "string") {
        window.location.href = json.url;
        return true; // navigating away — leave loading on
      }
      throw new Error(json.error || fallbackError);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  }, []);

  const startCheckout = useCallback(
    () => go("/api/billing/checkout", "Checkout is unavailable"),
    [go],
  );

  const openPortal = useCallback(
    () => go("/api/billing/portal", "Billing portal is unavailable"),
    [go],
  );

  return { loading, startCheckout, openPortal };
}
