import { describe, expect, it } from "bun:test";
import { deriveCardMeta, type GalleryCardMeta } from "./galleryCategories";
import type { FewerNode } from "./types";

function fakeNode(overrides: Partial<FewerNode["data"]> & { id?: string }): FewerNode {
  return {
    id: overrides.id ?? "n-" + Math.random().toString(36).slice(2, 8),
    type: "folder",
    data: {
      label: "x",
      path: "/x",
      type: "folder",
      ...overrides,
    },
    position: { x: 0, y: 0 },
  } as unknown as FewerNode;
}

describe("deriveCardMeta", () => {
  it("returns nulls for an empty node list", () => {
    const meta = deriveCardMeta([], null);
    expect(meta.gallery_category).toBeNull();
    expect(meta.gallery_categories).toBeNull();
    expect(meta.gallery_preview).toBeNull();
    expect(meta.author_name).toBeNull();
    expect(meta.author_username).toBeNull();
  });

  it("derives primary category from dominant file category", () => {
    const nodes = [
      fakeNode({ id: "root", isRoot: true, type: "folder", label: "proj" }),
      fakeNode({ id: "f1", type: "file", category: "code", label: "a.ts", parentId: "root" }),
      fakeNode({ id: "f2", type: "file", category: "code", label: "b.ts", parentId: "root" }),
      fakeNode({ id: "f3", type: "file", category: "config", label: "c.json", parentId: "root" }),
    ];
    const meta = deriveCardMeta(nodes, null);
    expect(meta.gallery_category).toBe("code");
    expect(meta.gallery_categories).toEqual({ code: 2, config: 1 });
  });

  it("builds preview from root + first-level children", () => {
    const nodes = [
      fakeNode({ id: "root", isRoot: true, type: "folder", label: "my-proj" }),
      fakeNode({ id: "a", type: "folder", label: "src", parentId: "root", position: { x: 0, y: 0 } }),
      fakeNode({ id: "b", type: "file", label: "README.md", parentId: "root", position: { x: 100, y: 0 } }),
    ];
    const meta = deriveCardMeta(nodes, null);
    expect(meta.gallery_preview).not.toBeNull();
    expect(meta.gallery_preview!.root).toBe("my-proj");
    expect(meta.gallery_preview!.nodeCount).toBe(3);
    expect(meta.gallery_preview!.children).toContain("src");
    expect(meta.gallery_preview!.children).toContain("README.md");
  });

  it("caps preview children at MAX_PREVIEW_CHILDREN", () => {
    const children = Array.from({ length: 12 }, (_, i) =>
      fakeNode({ id: `c${i}`, type: "file", label: `file${i}.ts`, parentId: "root" }),
    );
    const nodes = [
      fakeNode({ id: "root", isRoot: true, type: "folder", label: "big" }),
      ...children,
    ];
    const meta = deriveCardMeta(nodes, null);
    expect(meta.gallery_preview!.children.length).toBeLessThanOrEqual(6);
  });

  it("stores author from profile", () => {
    const meta = deriveCardMeta([], { first_name: "Ada", username: "ada" });
    expect(meta.author_name).toBe("Ada");
    expect(meta.author_username).toBe("ada");
  });

  it("returns null author for missing profile", () => {
    const meta = deriveCardMeta([], null);
    expect(meta.author_name).toBeNull();
    expect(meta.author_username).toBeNull();
  });

  it("trims and caps long author fields", () => {
    const long = "x".repeat(200);
    const meta = deriveCardMeta([], { first_name: long, username: long });
    expect(meta.author_name!.length).toBeLessThanOrEqual(100);
    expect(meta.author_username!.length).toBeLessThanOrEqual(100);
  });

  it("ignores folder nodes for category histogram", () => {
    const nodes = [
      fakeNode({ id: "root", isRoot: true, type: "folder", label: "proj" }),
      fakeNode({ id: "d1", type: "folder", label: "src", parentId: "root" }),
      fakeNode({ id: "d2", type: "folder", label: "lib", parentId: "root" }),
    ];
    const meta = deriveCardMeta(nodes, null);
    expect(meta.gallery_category).toBeNull();
    expect(meta.gallery_categories).toBeNull();
  });
});
