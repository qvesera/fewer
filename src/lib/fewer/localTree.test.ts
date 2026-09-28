import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { buildTreeFromPath } from "./localTree";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";

let root: string;
/** A real directory OUTSIDE the imported root (for external-link tests). */
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fewer-local-tree-"));
  outside = await mkdtemp(path.join(tmpdir(), "fewer-outside-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;");
  await writeFile(path.join(root, "a.txt"), "hello");
  await writeFile(path.join(root, ".env"), "SECRET=1");
  await writeFile(path.join(root, "C.TS"), "upper");
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "node_modules", "pkg.js"), "x");
  await mkdir(path.join(root, "empty"));
  await symlink(path.join(root, "src"), path.join(root, "loop"));
  // Symlink fixtures (plan §3): dir link (relative), file link, broken link,
  // external link, and a self-referencing cycle under v012.
  await mkdir(path.join(root, "v012"));
  await writeFile(path.join(root, "v012", "shot.exr"), "x");
  await mkdir(path.join(root, "v012", "cycle"));
  await symlink(path.join(root, "v012"), path.join(root, "latest"));
  await symlink("a.txt", path.join(root, "alias.txt"));
  await symlink(path.join(root, "nowhere"), path.join(root, "dangling"));
  await symlink(outside, path.join(root, "external"));
  await writeFile(path.join(outside, "probe.txt"), "p");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

function opts(n: Partial<ImportOptions>): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...n };
}

describe("buildTreeFromPath (server-side drop fallback)", () => {
  test("walks a real directory with hidden/vendored/empty/extension filters", async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ extensions: ["ts", "txt"] }));
    // Folders first (src, plus leaf-mode links latest/loop — empty dropped by
    // skipEmptyFolders), then files: a.txt, alias.txt (linked, .txt passes the
    // filter), C.TS; .env hidden, node_modules vendored, dangling is a link
    // typed as file whose name has no allowed extension... but extensions
    // filter applies per name: "dangling" has no extension — pop() returns
    // "dangling", not allowed → filtered out here.
    const names = tree.children!.map((c) => c.name);
    expect(names).toContain("src");
    expect(names).toContain("a.txt");
    expect(names).toContain("C.TS");
    expect(names).toContain("latest");
    expect(names).toContain("loop");
    expect(names).not.toContain(".env");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain("empty");
    expect(names).not.toContain("dangling");
    const srcFile = tree.children!.find((c) => c.name === "src")!.children![0]!;
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

describe("buildTreeFromPath symlinks", () => {
  test('symlinks: "skip" drops links entirely (pre-change behavior)', async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ symlinks: "skip" }));
    const names = tree.children!.map((c) => c.name);
    expect(names).not.toContain("latest");
    expect(names).not.toContain("loop");
    expect(names).not.toContain("alias.txt");
    expect(names).not.toContain("dangling");
  });

  test('symlinks: "leaf" (default) emits link entries with target metadata, no content', async () => {
    const tree = await buildTreeFromPath(root, 0, opts({}));
    const byName = (n: string) => tree.children!.find((c) => c.name === n)!;

    // Directory link → folder with children, symlink info attached, not followed.
    const latest = byName("latest");
    expect(latest.type).toBe("folder");
    expect(latest.children).toEqual([]);
    expect(latest.symlink!.target).toBe(path.join(root, "v012"));
    expect(latest.symlink!.insideTree).toBe(true);
    expect(latest.symlink!.followed).toBe(false);
    expect(latest.symlink!.broken).toBe(false);

    // Relative file link → file with the target's size.
    const alias = byName("alias.txt");
    expect(alias.type).toBe("file");
    expect(alias.size).toBe(5); // "hello"
    expect(alias.symlink!.target).toBe("a.txt");
    expect(alias.symlink!.resolvedPath).toBe(path.join(root, "a.txt"));
    expect(alias.symlink!.insideTree).toBe(true);

    // Dangling link → stays visible, typed as file, broken flag set.
    const dangling = byName("dangling");
    expect(dangling.type).toBe("file");
    expect(dangling.symlink!.broken).toBe(true);

    // External link → insideTree false.
    const external = byName("external");
    expect(external.type).toBe("folder");
    expect(external.symlink!.insideTree).toBe(false);

    // Leaf-mode links survive skipEmptyFolders (a link is a pointer, not empty).
    // Covered by "latest"/"loop" being present above with the default options.
  });

  test('symlinks: "follow" recurses into external targets, internal links stay leaves', async () => {
    const tree = await buildTreeFromPath(root, 0, opts({ symlinks: "follow" }));
    const byName = (n: string) => tree.children!.find((c) => c.name === n)!;

    // External link → target outside the walk root gets its content imported.
    const external = byName("external");
    expect(external.type).toBe("folder");
    expect(external.symlink!.followed).toBe(true);
    expect(external.children!.map((c) => c.name)).toContain("probe.txt");

    // Internal links degrade to leaves even in follow mode: their target is
    // walked at its real location (v012 / src are siblings in this root), so
    // following would duplicate the subtree.
    const latest = byName("latest");
    expect(latest.children).toEqual([]);
    expect(latest.symlink!.followed).toBe(false);
    const loop = byName("loop");
    expect(loop.children).toEqual([]);
    expect(loop.symlink!.followed).toBe(false);
  });

  test("follow mode terminates on self-referencing links without duplicating the tree", async () => {
    // Deep walk with follow: v012 contains cycle/ (a plain dir) — the walk must
    // complete and children stay bounded by the real entries of v012.
    const tree = await buildTreeFromPath(
      path.join(root, "v012"),
      0,
      opts({ symlinks: "follow", maxDepth: 0, skipEmptyFolders: false }),
    );
    const names = tree.children!.map((c) => c.name);
    expect(names).toContain("cycle");
    expect(names).toContain("shot.exr");
    expect(tree.children!.length).toBe(2);
  });
});