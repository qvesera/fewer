import { describe, expect, test } from "bun:test";
import { planFromSubscription, extractCustomerId } from "./billingWebhook";

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
