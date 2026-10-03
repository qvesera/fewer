// T-091 / #303: native walk (windowed list_dir RPC) + preview classification.
import { describe, expect, test } from "bun:test";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import {
  buildTreeFromNative,
  resolveLinkTarget,
  type NativeDirPage,
  type NativeListDir,
  type NativeListEntry,
} from "./nativeTree";
import { previewCapFor, previewKindFor, imageMimeFor } from "./previewKind";
import type { TreeEntry } from "./types";

/** fs-like fixture: path → entries. listDir serves pages from it. */
function fakeListDir(fsMap: Record<string, NativeListEntry[]>): NativeListDir {
  return async (path, offset, limit) => {
    const all = fsMap[path] ?? [];
    const page: NativeDirPage = {
      entries: all.slice(offset, offset + limit),
      total: all.length,
    };
    return page;
  };
}

function opts(over: Partial<ImportOptions> = {}): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...over };
}

function childNames(tree: TreeEntry): string[] {
  return (tree.children ?? []).map((c) => c.name);
}

const ROOT = "/proj";

describe("buildTreeFromNative", () => {
  test("walks nested dirs, folders first, alphabetical", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {
      "/proj": [
        { name: "zeta.txt", type: "file", size: 3 },
        { name: "src", type: "folder" },
      ],
      "/proj/src": [
        { name: "main.rs", type: "file", size: 10 },
        { name: "lib", type: "folder" },
      ],
      "/proj/src/lib": [{ name: "mod.rs", type: "file", size: 1 }],
    };
    const tree = await buildTreeFromNative(ROOT, opts(), fakeListDir(fsMap));
    expect(tree.name).toBe("proj");
    expect(childNames(tree)).toEqual(["src", "zeta.txt"]);
    const src = tree.children![0]!;
    expect(childNames(src)).toEqual(["lib", "main.rs"]);
  });

  test("pages beyond PAGE_SIZE are fully read", async () => {
    const many: NativeListEntry[] = Array.from({ length: 1200 }, (_, i) => ({
      name: `f${String(i).padStart(4, "0")}.txt`,
      type: "file" as const,
      size: 1,
    }));
    const tree = await buildTreeFromNative(ROOT, opts(), fakeListDir({ "/proj": many }));
    expect(tree.children).toHaveLength(1200);
  });

  test("hidden + vendored filters apply", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {
      "/proj": [
        { name: ".env", type: "file" },
        { name: "node_modules", type: "folder" },
        { name: "keep.txt", type: "file" },
      ],
      "/proj/node_modules": [{ name: "x.js", type: "file" }],
    };
    const tree = await buildTreeFromNative(ROOT, opts(), fakeListDir(fsMap));
    expect(childNames(tree)).toEqual(["keep.txt"]);
  });

  test("extension filter keeps archives only when expansion is on", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {
      "/proj": [
        { name: "a.ts", type: "file" },
        { name: "b.md", type: "file" },
        { name: "c.zip", type: "file" },
      ],
    };
    const filtered = await buildTreeFromNative(
      ROOT, opts({ extensions: ["ts"] }), fakeListDir(fsMap),
    );
    expect(childNames(filtered)).toEqual(["a.ts"]);
    const withArchives = await buildTreeFromNative(
      ROOT, opts({ extensions: ["ts"], expandArchives: true }), fakeListDir(fsMap),
    );
    // expansion itself fails silently (no reader bytes in the fake) but the
    // archive entry survives the filter — same as the other walkers.
    expect(childNames(withArchives)).toContain("c.zip");
  });

  test("maxDepth caps recursion (0 → cap 8)", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {};
    let p = "/proj";
    for (let d = 0; d < 12; d++) {
      const child = `${p}/d${d}`;
      fsMap[p] = [{ name: `d${d}`, type: "folder" }];
      p = child;
    }
    fsMap[p] = [{ name: "deep.txt", type: "file" }];
    const tree = await buildTreeFromNative(
      ROOT,
      opts({ maxDepth: 2, skipEmptyFolders: false }),
      fakeListDir(fsMap),
    );
    let cur: TreeEntry = tree;
    let depth = 0;
    while (cur.children?.length) {
      cur = cur.children[0]!;
      depth++;
    }
    expect(depth).toBe(2);
  });

  test("symlinks: skip drops, leaf keeps, follow recurses outside root, cycles stop", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {
      "/proj": [
        { name: "link-out", type: "folder", symlink: { target: "/ext", broken: false } },
        { name: "dead", type: "file", symlink: { target: "/gone", broken: true } },
      ],
      "/ext": [{ name: "via-link.txt", type: "file", size: 1 }],
    };
    // skip: nothing remains (skipEmptyFolders off — both links dropped)
    const skipped = await buildTreeFromNative(
      ROOT, opts({ symlinks: "skip" }), fakeListDir(fsMap),
    );
    expect(childNames(skipped)).toEqual([]);
    // leaf: links kept, no recursion into /ext
    const leaf = await buildTreeFromNative(
      ROOT, opts({ symlinks: "leaf" }), fakeListDir(fsMap),
    );
    expect(childNames(leaf)).toEqual(["link-out", "dead"]);
    expect(leaf.children!.flatMap((c) => c.children ?? [])).toEqual([]);
    // follow: /ext subtree imported through the link
    const followed = await buildTreeFromNative(
      ROOT, opts({ symlinks: "follow" }), fakeListDir(fsMap),
    );
    const linkOut = followed.children!.find((c) => c.name === "link-out")!;
    expect(childNames(linkOut)).toEqual(["via-link.txt"]);
    expect(linkOut.symlink?.followed).toBe(true);
    // cycle: link target = root itself → degrades to a leaf, walk terminates
    const cyclic: Record<string, NativeListEntry[]> = {
      "/proj": [{ name: "loop", type: "folder", symlink: { target: "/proj", broken: false } }],
    };
    const tree = await buildTreeFromNative(
      ROOT, opts({ symlinks: "follow" }), fakeListDir(cyclic),
    );
    const loop = tree.children!.find((c) => c.name === "loop")!;
    expect(loop.children).toEqual([]); // insideTree → not followed
    expect(loop.symlink?.followed).toBe(false);
  });

  test("skipEmptyFolders drops empty dirs, keeps dirs with files", async () => {
    const fsMap: Record<string, NativeListEntry[]> = {
      "/proj": [
        { name: "empty", type: "folder" },
        { name: "full", type: "folder" },
      ],
      "/proj/full": [{ name: "x.txt", type: "file" }],
    };
    const tree = await buildTreeFromNative(
      ROOT, opts({ skipEmptyFolders: true }), fakeListDir(fsMap),
    );
    expect(childNames(tree)).toEqual(["full"]);
  });
});

describe("resolveLinkTarget", () => {
  test("resolves relative and absolute targets with normalization", () => {
    expect(resolveLinkTarget("/proj/src/a.txt", "../b")).toBe("/proj/b");
    expect(resolveLinkTarget("/proj/src/a.txt", "/etc/x")).toBe("/etc/x");
    expect(resolveLinkTarget("/proj/src/a.txt", "./y/./z")).toBe("/proj/src/y/z");
  });
});

describe("previewKind", () => {
  test("classifies images, pdf, text, none", () => {
    expect(previewKindFor("photo.JPEG")).toBe("image");
    expect(previewKindFor("doc.pdf")).toBe("pdf");
    expect(previewKindFor("main.rs")).toBe("text");
    expect(previewKindFor(".gitignore")).toBe("text");
    expect(previewKindFor("app.tar.gz")).toBe("none");
    expect(previewKindFor("archive.zip")).toBe("none");
  });

  test("caps follow kind", () => {
    expect(previewCapFor("image")).toBe(50 * 1024 * 1024);
    expect(previewCapFor("pdf")).toBe(100 * 1024 * 1024);
    expect(previewCapFor("text")).toBe(2 * 1024 * 1024);
    expect(previewCapFor("none")).toBe(0);
  });

  test("image mime guesses", () => {
    expect(imageMimeFor("a.png")).toBe("image/png");
    expect(imageMimeFor("a.svg")).toBe("image/svg+xml");
    expect(imageMimeFor("a.jpg")).toBe("image/jpeg");
  });
});
