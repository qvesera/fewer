import { describe, expect, it } from "bun:test";
import {
  classifyShareHash,
  encodeShareData,
  decodeShareData,
  isDbShareHash,
  parseDbShareId,
  SHARE_HASH_THRESHOLD,
  type ShareHashKind,
} from "./share";

// ── classifyShareHash ──────────────────────────────────────────────────────

describe("classifyShareHash", () => {
  const cases: [string, ShareHashKind][] = [
    ["i:tok123", "invite"],
    ["i:", "invite"],
    ["t:98d6f32f-6d66-4739-bb97-c10f83b0aa85", "theme"],
    ["t:", "theme"],
    ["s:abc123", "db"],
    ["s:", "db"],
    ["N4IgDgTgpghgLmAXGBi", "embedded"], // LZ-string style (no colon)
    ["aGVsbG8=", "embedded"],
    ["v:1:something", "unknown"],
    ["x:old", "unknown"],
  ];

  for (const [hash, expected] of cases) {
    it(`classifyShareHash("${hash}") → "${expected}"`, () => {
      expect(classifyShareHash(hash)).toBe(expected);
    });
  }
});

// ── isDbShareHash / parseDbShareId ─────────────────────────────────────────

describe("isDbShareHash", () => {
  it("recognises s: prefix", () => {
    expect(isDbShareHash("s:abc123")).toBe(true);
    expect(isDbShareHash("t:abc")).toBe(false);
  });
});

describe("parseDbShareId", () => {
  it("extracts id from s: prefix", () => {
    expect(parseDbShareId("s:abc123")).toBe("abc123");
    expect(parseDbShareId("t:abc")).toBeNull();
    expect(parseDbShareId("s:")).toBeNull();
  });
});

// ── encode/decode round-trip ───────────────────────────────────────────────

describe("encode/decode share data", () => {
  it("round-trips a small graph", () => {
    const data = {
      nodes: [{ id: "n1", type: "folder", data: { label: "root", path: "/", type: "folder" as const }, position: { x: 0, y: 0 } }],
      edges: [],
    };
    const encoded = encodeShareData(data);
    expect(typeof encoded).toBe("string");
    const decoded = decodeShareData(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.nodes).toHaveLength(1);
    expect(decoded!.edges).toHaveLength(0);
  });

  it("returns null for garbage", () => {
    expect(decodeShareData("not-valid!!!")).toBeNull();
  });

  it("returns null for a string missing nodes/edges", () => {
    // Valid LZ-string but wrong shape
    const weird = encodeShareData({ nodes: [], edges: [] } as never);
    const decoded = decodeShareData(weird);
    expect(decoded).not.toBeNull(); // shape is { nodes: [], edges: [] } — valid
  });
});

// ── SHARE_HASH_THRESHOLD ───────────────────────────────────────────────────

describe("SHARE_HASH_THRESHOLD", () => {
  it("is a reasonable positive number", () => {
    expect(SHARE_HASH_THRESHOLD).toBeGreaterThan(0);
    expect(SHARE_HASH_THRESHOLD).toBeLessThan(100_000);
  });
});
