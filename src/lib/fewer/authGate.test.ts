import { describe, expect, it } from "bun:test";
import { shouldDeferHashForAuth, PENDING_AUTH_HASH_KEY } from "./authGate";

describe("shouldDeferHashForAuth", () => {
  const cases: [search: string, hash: string, hasUser: boolean, expected: boolean, why: string][] = [
    ["?auth=open", "t:abc", false, true, "gallery link, signed out → hold"],
    ["?auth=open", "s:abc", false, true, "graph links hold too"],
    ["?auth=open", "i:tok", false, true, "invite links hold too"],
    ["?auth=open", "t:abc", true, false, "already signed in → apply at once"],
    ["", "t:abc", false, false, "no gate param → normal deep link"],
    ["", "t:abc", true, false, "no gate param + signed in → apply"],
    ["?auth=open", "", false, false, "nothing to hold (dialog-only)"],
    ["?auth=close", "t:abc", false, false, "unrelated param value ignored"],
    ["?foo=bar&auth=open", "t:abc", false, true, "param found among others"],
    ["?cloud=connected&auth=open", "t:abc", true, false, "gate lost once signed in"],
  ];

  for (const [search, hash, hasUser, expected, why] of cases) {
    it(`${why}: "${search}" hash="${hash}" user=${hasUser} → ${expected}`, () => {
      expect(shouldDeferHashForAuth(search, hash, hasUser)).toBe(expected);
    });
  }
});

describe("PENDING_AUTH_HASH_KEY", () => {
  it("is a namespaced sessionStorage key", () => {
    expect(PENDING_AUTH_HASH_KEY).toMatch(/^fewer-[a-z-]+$/);
  });
});
