import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { buildTreeFromPath } from "./localTree";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fewer-local-tree-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;");
  await writeFile(path.join(root, "a.txt"), "hello");
  await writeFile(path.join(root, ".env"), "SECRET=1");
  await writeFile(path.join(root, "C.TS"), "upper");
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "node_modules", "pkg.js"), "x");
  await mkdir(path.join(root, "empty"));
  await symlink(path.join(root, "src"), path.join(root, "loop"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function opts(n: Partial<ImportOptions>): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...n };
}

describe("buildTreeFromPath (server-side drop fallback)", () => {
  test("walks a real directory with hidden/vendored/empty/extension filters", async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ extensions: ["ts", "txt"] }));
    // Folders first (src, empty dropped by skipEmptyFolders), then files
    // a.txt + C.TXT pass the case-insensitive extension filter; .env hidden,
    // node_modules vendored, loop symlink skipped.
    expect(tree.name).toBe(path.basename(root));
    expect(tree.children!.map((c) => c.name)).toEqual(["src", "a.txt", "C.TS"]);
    const srcFile = tree.children![0]!.children![0]!;
    expect(srcFile.name).toBe("index.ts");
    expect(srcFile.type).toBe("file");
    expect(srcFile.size).toBeGreaterThan(0);
  });

  test("respects maxDepth", async () => {
    // skipEmptyFolders off: a folder at the depth cap has no children read, so
    // with the default on it would be dropped as "empty" and vanish entirely.
    const tree = await buildTreeFromPath(root, 0, opts({ maxDepth: 1, skipEmptyFolders: false }));
    expect(tree.children!.some((c) => c.name === "src")).toBe(true);
    expect(tree.children!.find((c) => c.name === "src")!.children).toEqual([]);
  });

  test("clamps maxDepth 0 (unlimited) to a safe bound instead of crawling the disk", async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ maxDepth: 0 }));
    // Deep enough to prove it recursed, without hanging on the whole fs.
    expect(tree.children!.some((c) => c.name === "src")).toBe(true);
  });

  test("keeps empty folders when skipEmptyFolders is off", async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ skipEmptyFolders: false }));
    const names = tree.children!.map((c) => c.name);
    expect(names).toContain("empty");
  });

  test("includes vendored + hidden when their flags are on", async () => {
    const tree = await buildTreeFromPath(
      root,
      0,
      opts({ includeHidden: true, includeVendored: true, skipEmptyFolders: false }),
    );
    const names = tree.children!.map((c) => c.name);
    expect(names).toContain(".env");
    expect(names).toContain("node_modules");
  });
});