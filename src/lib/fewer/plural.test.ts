import { describe, expect, test } from "bun:test";
import { plural } from "./plural";

describe("plural", () => {
  test("singular for exactly one", () => {
    expect(plural(1, "node")).toBe("1 node");
    expect(plural(1, "item")).toBe("1 item");
  });

  test("regular plural otherwise", () => {
    expect(plural(0, "node")).toBe("0 nodes");
    expect(plural(2, "node")).toBe("2 nodes");
    expect(plural(42, "edge")).toBe("42 edges");
  });

  test("negative counts pluralize", () => {
    expect(plural(-1, "node")).toBe("-1 nodes");
  });

  test("irregular noun via explicit plural form", () => {
    expect(plural(2, "category", "categories")).toBe("2 categories");
    expect(plural(1, "category", "categories")).toBe("1 category");
  });
});
