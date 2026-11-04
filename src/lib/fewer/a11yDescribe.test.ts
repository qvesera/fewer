import { describe, expect, it } from "bun:test";
import { describeNode } from "./a11yDescribe";
import type { FewerNode } from "./types";

const node = (data: Partial<FewerNode["data"]>): FewerNode =>
  ({
    id: "n1",
    position: { x: 0, y: 0 },
    data: { label: "src", type: "folder", path: "/src", ...data },
  }) as unknown as FewerNode;

describe("describeNode", () => {
  it("leads with the name and carries kind, level, size and tags", () => {
    expect(
      describeNode(node({}), { childCount: 12, depth: 1, tagNames: ["backend", "api"] }),
    ).toBe("src, folder, level 2, 12 children, tags backend, api");
  });

  it("marks the top level and singular counts", () => {
    expect(describeNode(node({}), { childCount: 1, depth: 0, tagNames: [] })).toBe(
      "src, folder, top level, 1 child",
    );
  });

  it("says so when a folder has no children", () => {
    expect(describeNode(node({}), { childCount: 0, depth: 2, tagNames: [] })).toBe(
      "src, folder, level 3, no children",
    );
  });

  it("adds root, hidden, dimmed and collapsed flags that change what a keypress does", () => {
    expect(
      describeNode(node({ isRoot: true, dimmed: true, collapsed: true, type: "file" }), {
        childCount: 0,
        depth: 0,
        tagNames: [],
      }),
    ).toBe("src, file, top level, root card, not matched, dimmed, collapsed");
    expect(describeNode(node({}), { childCount: 3, depth: 0, tagNames: [], hiddenChildCount: 2 })).toBe(
      "src, folder, top level, 3 children, 2 hidden",
    );
  });
});
