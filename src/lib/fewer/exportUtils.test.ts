import { describe, expect, test } from "bun:test";
import { buildJsonExport } from "./exportUtils";
import { APP_VERSION, FEWER_CREDIT } from "./branding";
import type { FewerNode } from "./types";

const node = (id: string): FewerNode =>
  ({
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type: "folder" },
  }) as unknown as FewerNode;

function meta(includeBranding = true): Record<string, unknown> {
  return buildJsonExport([node("a")], [], undefined, includeBranding)
    .meta as Record<string, unknown>;
}

describe("buildJsonExport meta", () => {
  test("stamps APP_VERSION, not a hardcoded literal", () => {
    expect(meta().version).toBe(APP_VERSION);
    expect(meta().version).not.toBe("1.0.0");
  });

  test("identifies the application", () => {
    expect(meta().application).toBe("fewer");
  });

  test("appends the shared credit line when branding enabled", () => {
    expect(meta().generatedBy).toBe(FEWER_CREDIT);
  });

  test("omits generatedBy when branding disabled", () => {
    expect(meta(false).generatedBy).toBeUndefined();
  });

  test("carries exportedAt, stats and mapped nodes", () => {
    const out = buildJsonExport([node("a")], []);
    expect(typeof (out.meta as Record<string, unknown>).exportedAt).toBe("string");
    expect(out.stats).toBeNull();
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });
});
