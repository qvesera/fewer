import { describe, expect, test } from "bun:test";
import { isTokenExpiringSoon } from "./tokenExpiry";

const S = 1000;

// ponytail: every case uses a generous margin, because these are relative
// timestamps — the value is computed at construction and re-checked against a
// later Date.now(), so the exact 60s boundary (t_construct == t_check) is only
// reachable if the clock never advances between the two reads: a token built
// at now+60s is by then inside the window and returns true. Near-boundary
// assertions (e.g. +59s, 1s of slack) flip on any backward clock step
// (NTP/systemd-timesyncd, container/VM snapshot). Upgrade path for exact
// boundaries: pin the clock with setSystemTime() from bun:test.
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
    expect(isTokenExpiringSoon(new Date(Date.now() + 10 * S).toISOString())).toBe(true);
    expect(isTokenExpiringSoon(new Date(Date.now() + 45 * S).toISOString())).toBe(true);
  });

  test("valid beyond the window → false", () => {
    expect(isTokenExpiringSoon(new Date(Date.now() + 2 * 60 * S).toISOString())).toBe(false);
    expect(isTokenExpiringSoon(new Date(Date.now() + 24 * 60 * 60 * S).toISOString())).toBe(false);
  });
});
