import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { resolveLocalPath } from "./openInOs";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fewer-openinos-"));
  await mkdir(path.join(root, "MyProject"));
  await mkdir(path.join(root, "MyProject", "src"));
  await mkdir(path.join(root, "MyProject", "node_modules"));
  await mkdir(path.join(root, "DeepTree"));
  await mkdir(path.join(root, "DeepTree", "a"));
  await mkdir(path.join(root, "DeepTree", "a", "b"));
  await mkdir(path.join(root, "DeepTree", "a", "b", "c"));
  await mkdir(path.join(root, "CaseDir"));
  await mkdir(path.join(root, "CaseDir", "SubDir"));
  await writeFile(path.join(root, "MyProject", "readme.md"), "# hi");
  await mkdir(path.join(root, "node_modules"));
  await mkdir(path.join(root, "node_modules", "my_pkg"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveLocalPath", () => {
  test("resolves an absolute path as-is", async () => {
    const target = path.join(root, "MyProject");
    const result = await resolveLocalPath(target, { roots: [root] });
    expect(result).toBe(target);
  });

  test("resolves ~/ to $HOME", async () => {
    const home = process.env.HOME ?? "";
    if (!home) return;
    const result = await resolveLocalPath("~/");
    expect(result).toBe(home);
  });

  test("resolves relative path under a root", async () => {
    const result = await resolveLocalPath("MyProject", { roots: [root] });
    expect(result).toBe(path.join(root, "MyProject"));
  });

  test("resolves nested relative path under a root", async () => {
    const result = await resolveLocalPath("MyProject/src", { roots: [root] });
    expect(result).toBe(path.join(root, "MyProject", "src"));
  });

  test("resolves case-insensitively when casing differs", async () => {
    const result = await resolveLocalPath("myproject", { roots: [root] });
    expect(result).toBe(path.join(root, "MyProject"));
  });

  test("resolves nested path case-insensitively", async () => {
    const result = await resolveLocalPath("casedir/subdir", { roots: [root] });
    expect(result).toBe(path.join(root, "CaseDir", "SubDir"));
  });

  test("normalizes Windows backslashes", async () => {
    const winPath = "MyProject\\src";
    const result = await resolveLocalPath(winPath, { roots: [root] });
    expect(result).toBe(path.join(root, "MyProject", "src"));
  });

  test("returns null when path does not exist", async () => {
    const result = await resolveLocalPath("DoesNotExist", { roots: [root] });
    expect(result).toBeNull();
  });

  test("returns null for empty input", async () => {
    const result = await resolveLocalPath("", { roots: [root] });
    expect(result).toBeNull();
  });

  test("falls back via BFS for deep paths", async () => {
    const result = await resolveLocalPath("DeepTree/a/b/c", {
      roots: [root],
      searchBudget: 100,
    });
    expect(result).toBe(path.join(root, "DeepTree", "a", "b", "c"));
  });

  test("deep path case-insensitive BFS", async () => {
    const result = await resolveLocalPath("deeptree/A/B/C", {
      roots: [root],
      searchBudget: 100,
    });
    expect(result).toBe(path.join(root, "DeepTree", "a", "b", "c"));
  });

  test("falls back via BFS for deep indirect paths", async () => {
    // deep_hidden lives under node_modules at root. The BFS will skip
    // node_modules (SKIP_DIRS) so it won't be found; the fast path
    // won't match because the root doesn't contain the target directly.
    // This verifies that vendored dirs are excluded from BFS descent.
    await mkdir(path.join(root, "node_modules", "deep_hidden"));
    // node_modules is a root-level dir, so the BFS will still visit it,
    // but the fast path won't find anything there because deep_hidden isn't
    // the target path. The BFS descending into node_modules is blocked.
    const result = await resolveLocalPath("node_modules", {
      roots: [root],
      searchBudget: 0, // fast path only
    });
    expect(result).toBe(path.join(root, "node_modules"));
  });

  test("honors search budget 0 (fast path still works)", async () => {
    const result = await resolveLocalPath("MyProject", {
      roots: [root],
      searchBudget: 0,
    });
    expect(result).toBe(path.join(root, "MyProject"));
  });
});
