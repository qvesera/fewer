import { describe, expect, test } from "bun:test";
import { contrastStroke } from "./types";
import { symlinkAriaLabel, symlinkBadgeText, symlinkTooltip } from "./symlinkDisplay";
import type { SymlinkInfo } from "./types";

const info = (partial: Partial<SymlinkInfo>): SymlinkInfo => ({
  target: "v012",
  resolvedPath: "/show/v012",
  insideTree: true,
  ...partial,
});

describe("contrastStroke", () => {
  test("solid view → dashed link edges; dashed/dotted views → solid (never dashed↔dotted)", () => {
    expect(contrastStroke("solid")).toBe("dashed");
    expect(contrastStroke("dashed")).toBe("solid");
    expect(contrastStroke("dotted")).toBe("solid");
  });
});

describe("symlinkDisplay", () => {
  test("badge text: basename, external suffix, broken warning", () => {
    expect(symlinkBadgeText(info({ target: "v012" }))).toBe("↷ v012");
    expect(symlinkBadgeText(info({ target: "../v012" }))).toBe("↷ v012");
    expect(symlinkBadgeText(info({ target: "/mnt/raid/v012", insideTree: false }))).toBe("↷ v012 (external)");
    expect(symlinkBadgeText(info({ target: "nowhere", broken: true }))).toBe("⚠ broken → nowhere");
  });

  test("tooltip carries the raw target and flags", () => {
    expect(symlinkTooltip(info({}))).toBe("symlink → v012 · resolves to /show/v012");
    expect(symlinkTooltip(info({ target: "missing", resolvedPath: "/show/missing", broken: true }))).toContain("dangling link");
    expect(symlinkTooltip(info({ target: "/mnt/x", resolvedPath: "/mnt/x", insideTree: false }))).toContain("outside the imported tree");
  });

  test("aria label names the target", () => {
    expect(symlinkAriaLabel(info({ target: "a.txt" }))).toBe("symlink to a.txt");
  });
});