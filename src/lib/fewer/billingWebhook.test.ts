import { describe, expect, test, mock } from "bun:test";
import { planFromSubscription, extractCustomerId, applyCheckoutCompleted, applySubscriptionChange } from "./billingWebhook";

describe("planFromSubscription", () => {
  test("active → pro", () => expect(planFromSubscription("active")).toBe("pro"));
  test("trialing → pro", () => expect(planFromSubscription("trialing")).toBe("pro"));
  test("past_due → pro (grace period)", () =>
    expect(planFromSubscription("past_due")).toBe("pro"));
  test("canceled → free", () => expect(planFromSubscription("canceled")).toBe("free"));
  test("unpaid → free", () => expect(planFromSubscription("unpaid")).toBe("free"));
  test("incomplete_expired → free", () =>
    expect(planFromSubscription("incomplete_expired")).toBe("free"));
});

describe("extractCustomerId", () => {
  test("plain string returned as-is", () => {
    expect(extractCustomerId("cus_123")).toBe("cus_123");
  });
  test("expanded object → .id", () => {
    expect(extractCustomerId({ id: "cus_456" })).toBe("cus_456");
  });
  test("expanded object with null id → null", () => {
    expect(extractCustomerId({ id: null })).toBeNull();
  });
  test("null → null", () => {
    expect(extractCustomerId(null)).toBeNull();
  });
  test("undefined → null", () => {
    expect(extractCustomerId(undefined)).toBeNull();
  });
});

// ── Mock Supabase service ──────────────────────────────────────────────────

type Call = { table: string; op: string; data?: unknown; opts?: unknown; col?: string; val?: unknown };

function mockService(initialError: string | null = null): { service: any; calls: Call[] } {
  const calls: Call[] = [];
  const err = initialError ? { message: initialError } : null;
  const eq = (col: string, val: unknown) => {
    calls[calls.length - 1].col = col;
    calls[calls.length - 1].val = val;
    return { error: err };
  };
  const service = {
    from: () => ({
      upsert: (data: unknown, opts: unknown) => {
        calls.push({ table: "profiles", op: "upsert", data, opts });
        return { error: err };
      },
      update: (data: unknown) => {
        calls.push({ table: "profiles", op: "update", data });
        return { eq };
      },
    }),
  };
  return { service, calls };
}

// ── applyCheckoutCompleted ──────────────────────────────────────────────────

describe("applyCheckoutCompleted", () => {
  const session = (overrides: Record<string, unknown> = {}) =>
    ({ client_reference_id: "u1", customer: "cus_abc", ...overrides }) as any;

  test("upserts profile with plan=pro", async () => {
    const { service, calls } = mockService();
    await applyCheckoutCompleted(service, session());
    expect(calls[0]).toEqual({
      table: "profiles", op: "upsert",
      data: { user_id: "u1", stripe_customer_id: "cus_abc", plan: "pro" },
      opts: { onConflict: "user_id" },
    });
  });

  test("no-op when client_reference_id is missing", async () => {
    const { service, calls } = mockService();
    await applyCheckoutCompleted(service, session({ client_reference_id: null }));
    expect(calls).toHaveLength(0);
  });

  test("no-op when customer is missing", async () => {
    const { service, calls } = mockService();
    await applyCheckoutCompleted(service, session({ customer: null }));
    expect(calls).toHaveLength(0);
  });

  test("throws on DB error", async () => {
    const { service } = mockService("duplicate key");
    await expect(
      applyCheckoutCompleted(service, session()),
    ).rejects.toThrow("duplicate key");
  });

  test("expanded customer object extracted", async () => {
    const { service, calls } = mockService();
    await applyCheckoutCompleted(service, session({ customer: { id: "cus_exp" } }));
    expect(calls[0].data).toMatchObject({ stripe_customer_id: "cus_exp" });
  });
});

// ── applySubscriptionChange ─────────────────────────────────────────────────

describe("applySubscriptionChange", () => {
  const sub = (status: string, customer: unknown = "cus_xyz") =>
    ({ status, customer }) as any;

  test("updates plan=pro for active subscription", async () => {
    const { service, calls } = mockService();
    await applySubscriptionChange(service, sub("active"));
    expect(calls[0]).toEqual({
      table: "profiles", op: "update",
      data: { plan: "pro" }, col: "stripe_customer_id", val: "cus_xyz",
    });
  });

  test("updates plan=free for canceled subscription", async () => {
    const { service, calls } = mockService();
    await applySubscriptionChange(service, sub("canceled"));
    expect(calls[0].data).toEqual({ plan: "free" });
  });

  test("past_due keeps pro (grace period)", async () => {
    const { service, calls } = mockService();
    await applySubscriptionChange(service, sub("past_due"));
    expect(calls[0].data).toEqual({ plan: "pro" });
  });

  test("no-op when customer id is missing", async () => {
    const { service, calls } = mockService();
    await applySubscriptionChange(service, sub("active", null));
    expect(calls).toHaveLength(0);
  });

  test("throws on DB error", async () => {
    const { service } = mockService("permission denied");
    await expect(
      applySubscriptionChange(service, sub("active")),
    ).rejects.toThrow("permission denied");
  });

  test("expanded customer object extracted", async () => {
    const { service, calls } = mockService();
    await applySubscriptionChange(service, sub("active", { id: "cus_exp2" }));
    expect(calls[0].val).toBe("cus_exp2");
  });
});
