import { describe, expect, test } from "bun:test";
import { isTokenExpiringSoon } from "./tokenExpiry";

const S = 1000;

describe("isTokenExpiringSoon", () => {
  test("absent expiry → false (token never expires)", () => {
    expect(isTokenExpiringSoon(null)).toBe(false);
    expect(isTokenExpiringSoon(undefined)).toBe(false);
    expect(isTokenExpiringSoon("")).toBe(false);
  });

  test("already expired → true", () => {
    expect(isTokenExpiringSoon(new Date(Date.now() - 5 * S).toISOString())).toBe(true);
  });

  test("expiring within the 60s window → true", () => {
    expect(isTokenExpiringSoon(new Date(Date.now() + 30 * S).toISOString())).toBe(true);
    expect(isTokenExpiringSoon(new Date(Date.now() + 59 * S).toISOString())).toBe(true);
  });

  test("valid beyond the window → false", () => {
    expect(isTokenExpiringSoon(new Date(Date.now() + 2 * 60 * S).toISOString())).toBe(false);
    expect(isTokenExpiringSoon(new Date(Date.now() + 24 * 60 * 60 * S).toISOString())).toBe(false);
  });
});
