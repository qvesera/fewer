import { describe, expect, test } from "bun:test";
import { buildTreeFromEntry } from "./fileSystem";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";

type FakeNode = {
  name: string;
  kind: "dir" | "file";
  size?: number;
  children?: FakeNode[];
};

function toEntry(node: FakeNode): FileSystemDirectoryEntry | FileSystemFileEntry {
  if (node.kind === "file") {
    return {
      name: node.name,
      isFile: true,
      isDirectory: false,
      file: (cb: (f: { size: number }) => void) => cb({ size: node.size ?? 0 }),
    } as unknown as FileSystemFileEntry;
  }
  const children = (node.children ?? []).map(toEntry);
  let served = false;
  return {
    name: node.name,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (cb: (e: FileSystemEntry[]) => void) => {
        // Real API fires async; microtask drains the batch loop without
        // recursing the call stack.
        const batch = served ? [] : children;
        served = true;
        queueMicrotask(() => cb(batch));
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
}

function opts(overrides: Partial<ImportOptions>): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...overrides };
}

const root = {
  name: "root",
  kind: "dir",
  children: [
    { name: "src", kind: "dir", children: [{ name: "index.ts", kind: "file", size: 100 }] },
    { name: "a.txt", kind: "file", size: 12 },
    { name: ".env", kind: "file", size: 1 },
    { name: "node_modules", kind: "dir", children: [] },
    { name: "empty", kind: "dir", children: [] },
  ],
} as FakeNode;

describe("buildTreeFromEntry (legacy drop entries)", () => {
  test("walks the hierarchy applying hidden/vendored/empty filters + size", async () => {
    const tree = await buildTreeFromEntry(toEntry(root) as FileSystemDirectoryEntry, 0, opts({}));
    // Folders first, then alphabetical: hidden, vendored, and empty all dropped.
    expect(tree.children!.map((c) => c.name)).toEqual(["src", "a.txt"]);
    expect(tree.children![0]!.children![0]).toMatchObject({ name: "index.ts", size: 100 });
    expect(tree.children![1]!.size).toBe(12);
  });

  test("respects maxDepth", async () => {
    const deep = {
      name: "root",
      kind: "dir",
      children: [
        {
          name: "src",
          kind: "dir",
          children: [
            { name: "inner", kind: "dir", children: [{ name: "deep.ts", kind: "file", size: 1 }] },
          ],
        },
      ],
    } as FakeNode;
    const tree = await buildTreeFromEntry(
      toEntry(deep) as FileSystemDirectoryEntry,
      0,
      opts({ maxDepth: 2, skipEmptyFolders: false }),
    );
    // `inner` (depth 2) is at the cap: it is scanned for presence but its own
    // children are never read — `deep.ts` (depth 3) stays out of the tree.
    expect(tree.children!.map((c) => c.name)).toEqual(["src"]);
    expect(tree.children![0]!.children!.map((c) => c.name)).toEqual(["inner"]);
    expect(tree.children![0]!.children![0]!.children).toEqual([]);
  });

  test("keeps empty folders when skipEmptyFolders is off", async () => {
    const tree = await buildTreeFromEntry(toEntry(root) as FileSystemDirectoryEntry, 0, opts({ skipEmptyFolders: false }));
    // `empty` is a folder → folders first, then alphabetical
    expect(tree.children!.map((c) => c.name)).toEqual(["empty", "src", "a.txt"]);
  });

  test("keeps a folder whose only content is files when includeFiles is false", async () => {
    const onlyFiles = {
      name: "root",
      kind: "dir",
      children: [
        { name: "assets", kind: "dir", children: [{ name: "logo.svg", kind: "file", size: 5 }] },
        { name: "truly-empty", kind: "dir", children: [] },
      ],
    } as FakeNode;
    const tree = await buildTreeFromEntry(
      toEntry(onlyFiles) as FileSystemDirectoryEntry,
      0,
      opts({ includeFiles: false }),
    );
    expect(tree.children!.map((c) => c.name)).toEqual(["assets"]);
  });

  test("applies the extension filter", async () => {
    const mixed = {
      name: "root",
      kind: "dir",
      children: [
        { name: "a.ts", kind: "file", size: 1 },
        { name: "b.txt", kind: "file", size: 2 },
        { name: "C.TS", kind: "file", size: 3 },
      ],
    } as FakeNode;
    const tree = await buildTreeFromEntry(
      toEntry(mixed) as FileSystemDirectoryEntry,
      0,
      opts({ extensions: ["ts"] }),
    );
    expect(tree.children!.map((c) => c.name)).toEqual(["a.ts", "C.TS"]);
  });
});