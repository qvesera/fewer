import { describe, expect, it } from "bun:test";
import { edgeDashPattern } from "./types";

describe("edgeDashPattern", () => {
  it("maps each stroke style to the SVG stroke-dasharray used across the app", () => {
    expect(edgeDashPattern("dashed")).toBe("8 4");
    expect(edgeDashPattern("dotted")).toBe("2 4");
    expect(edgeDashPattern("solid")).toBeUndefined();
  });
});