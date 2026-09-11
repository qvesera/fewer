import { describe, expect, test } from "bun:test";
import { isShareExpired, serverError } from "./apiHelpers";

describe("isShareExpired", () => {
  test("absent expiry → false (never expires)", () => {
    expect(isShareExpired(null)).toBe(false);
    expect(isShareExpired(undefined)).toBe(false);
    expect(isShareExpired("")).toBe(false);
  });

  test("past expiry → true", () => {
    expect(isShareExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  test("expiry within the next minute → false (not yet expired)", () => {
    expect(isShareExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});

describe("serverError", () => {
  test("Error instance → message + 500", async () => {
    const res = serverError(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  test("non-Error throw → 'Unknown error'", async () => {
    const res = serverError("nope");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unknown error" });
  });
});
