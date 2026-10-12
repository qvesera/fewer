import { describe, expect, test } from "bun:test";
import { LICENSING_ENABLED, shellTier } from "./licensing";

describe("LICENSING_ENABLED (T-148)", () => {
  test("ships OFF — a normal build never opts in, so there is no path to Pro", () => {
    expect(LICENSING_ENABLED).toBe(false);
  });
});

describe("shellTier — the desktop shell's tier from licence + ?tier= override", () => {
  test("rail off: always free, ignoring a licence file AND a ?tier= override", () => {
    // The override bypass and a dropped-in licence must both be inert, or a
    // free build could be promoted with no server to check it against.
    expect(shellTier("pro", "pro", false)).toBe("free");
    expect(shellTier("pro", null, false)).toBe("free");
    expect(shellTier(null, "pro", false)).toBe("free");
    expect(shellTier(null, null, false)).toBe("free");
  });

  test("rail on: override > licence > free (never guest)", () => {
    expect(shellTier("pro", "pro", true)).toBe("pro");
    expect(shellTier(null, "pro", true)).toBe("pro");
    expect(shellTier("pro", null, true)).toBe("pro");
    expect(shellTier(null, "free", true)).toBe("free");
    expect(shellTier(null, null, true)).toBe("free");
  });
});
