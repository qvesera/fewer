import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildChangesScript, planChanges } from "./changesScript";
import { captureBaseline, type BaselineEntry } from "./importBaseline";
import type { FewerNode } from "./types";

function node(
  id: string,
  path: string,
  type: "file" | "folder" = "file",
  extra: Record<string, unknown> = {},
): FewerNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: path.split("/").pop() ?? path, path, type, ...extra },
  } as unknown as FewerNode;
}

/** The root card plus its children, as an import would produce them. */
function tree(paths: [string, "file" | "folder"][]): FewerNode[] {
  const nodes = paths.map(([path, type]) => node(path, path, type));
  nodes.unshift(node("root", "project", "folder", { isRoot: true }));
  return nodes;
}

function baselineOf(nodes: FewerNode[]): BaselineEntry[] {
  return captureBaseline(nodes);
}

function bashAvailable(): boolean {
  return existsSync("/bin/bash") || existsSync("/usr/bin/bash");
}

/** Every file under a directory, as sorted relative paths. */
function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, "");
  return out.sort();
}

describe("planChanges", () => {
  test("a rename is one move", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([["project/b.txt", "file"]]);
    after[1].id = before[1].id; // same card, new name
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toEqual([{ id: before[1].id, from: "a.txt", to: "b.txt" }]);
  });

  test("a folder rename carries its children (no redundant child moves)", () => {
    const before = tree([
      ["project/src", "folder"],
      ["project/src/main.rs", "file"],
    ]);
    const after = tree([
      ["project/app", "folder"],
      ["project/app/main.rs", "file"],
    ]);
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].to).toBe("app");
  });

  test("a child that also moved on its own keeps its own move", () => {
    const before = tree([
      ["project/src", "folder"],
      ["project/src/main.rs", "file"],
    ]);
    const after = tree([
      ["project/app", "folder"],
      ["project/components/main.rs", "file"],
    ]);
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toHaveLength(2);
  });

  test("two folders swapped keep both moves", () => {
    const before = tree([
      ["project/src", "folder"],
      ["project/ui", "folder"],
    ]);
    const after = tree([
      ["project/ui", "folder"],
      ["project/src", "folder"],
    ]);
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toHaveLength(2);
    expect(plan.commitOrder).toHaveLength(2);
  });

  test("renaming back to the original name produces no command", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([["project/a.txt", "file"]]);
    after[1].id = before[1].id;
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
  });

  test("a deleted file is only removed when deletions are on", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([]);
    const off = planChanges(baselineOf(before), after, false);
    expect(off.deletes).toHaveLength(0);
    const on = planChanges(baselineOf(before), after, true);
    expect(on.deletes).toEqual(["a.txt"]);
  });

  test("a deleted folder is removed once, not once per child", () => {
    const before = tree([
      ["project/old", "folder"],
      ["project/old/x.txt", "file"],
    ]);
    const after = tree([]);
    const plan = planChanges(baselineOf(before), after, true);
    expect(plan.deletes).toEqual(["old"]);
  });

  test("a deletion inside a renamed folder is remapped to the new place", () => {
    const before = tree([
      ["project/src", "folder"],
      ["project/src/gone.txt", "file"],
    ]);
    const after = tree([["project/app", "folder"]]);
    after[1].id = before[1].id;
    const plan = planChanges(baselineOf(before), after, true);
    expect(plan.deletes).toEqual(["app/gone.txt"]);
  });
test("a new folder and file are created, a new file is empty", () => {
    const before = tree([]);
    const after = tree([
      ["project/docs", "folder"],
      ["project/docs/notes.md", "file"],
    ]);
    const plan = planChanges(baselineOf(before), after);
    expect(plan.mkdirs).toEqual(["docs"]);
    expect(plan.touches).toEqual(["docs/notes.md"]);
  });

  test("a duplicate replays as a copy of its source", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([
      ["project/a.txt", "file"],
      ["project/a copy.txt", "file"],
    ]);
    after[2].data.copyOf = before[1].id;
    const plan = planChanges(baselineOf(before), after);
    expect(plan.copies).toEqual([{ from: "a.txt", to: "a copy.txt" }]);
  });

  test("deleted and recreated at the same path is not a change", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([["project/a.txt", "file"]]);
    after[1].id = "fresh"; // different card, same path
    const plan = planChanges(baselineOf(before), after);
    expect(plan.moves).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.touches).toHaveLength(0);
  });

  test("a path that escapes the folder is never scripted", () => {
    const before = tree([]);
    const after = tree([["project/../escape.txt", "file"]]);
    const plan = planChanges(baselineOf(before), after);
    expect(plan.touches).toHaveLength(0);
    expect(plan.warnings.join(" ")).toContain("not safe");
  });
});

describe("buildChangesScript", () => {
  test("the script carries the checks, the prompts and the plan", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([["project/b.txt", "file"]]);
    after[1].id = before[1].id;
    const { script, summary } = buildChangesScript({
      baseline: baselineOf(before),
      nodes: after,
      fileName: "fewer-changes.sh",
    });
    expect(summary.renamed).toBe(1);
    expect(script).toContain("ROOT_NAME='project'");
    expect(script).toContain("Apply them? [y]es / [d]ry-run / [n]o");
    expect(script).toContain("Also delete");
    expect(script).toContain("wrong folder");
    expect(script).toContain("MOVES=('a.txt' 'b.txt')");
  });

  test("deletions are only planned when asked for", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([]);
    const off = buildChangesScript({ baseline: baselineOf(before), nodes: after });
    expect(off.script).not.toContain("DELETE_PATHS=('a.txt')");
    const on = buildChangesScript({
      baseline: baselineOf(before),
      nodes: after,
      includeDeletions: true,
    });
    expect(on.script).toContain("DELETE_PATHS=('a.txt')");
  });

  test("the generated script is valid bash", () => {
    if (!bashAvailable()) return;
    const before = tree([
      ["project/src", "folder"],
      ["project/src/main.rs", "file"],
    ]);
    const after = tree([
      ["project/app", "folder"],
      ["project/app/main.rs", "file"],
      ["project/new.txt", "file"],
    ]);
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    const { script } = buildChangesScript({ baseline: baselineOf(before), nodes: after });
    const file = join(mkdtempSync(join(tmpdir(), "fewer-syntax-")), "s.sh");
    writeFileSync(file, script);
    const check = Bun.spawnSync(["bash", "-n", file]);
    expect(check.stderr.toString()).toBe("");
    expect(check.exitCode).toBe(0);
  });

  test("the script replays a swap, a rename, a deletion and a creation", () => {
    if (!bashAvailable()) return;
    const root = mkdtempSync(join(tmpdir(), "fewer-replay-"));
    const project = join(root, "project");
    mkdirSync(join(project, "a"), { recursive: true });
    mkdirSync(join(project, "b"), { recursive: true });
    writeFileSync(join(project, "a", "one.txt"), "one");
    writeFileSync(join(project, "b", "two.txt"), "two");
    writeFileSync(join(project, "gone.txt"), "gone");

    // The import as it was on disk.
    const before = tree([
      ["project/a", "folder"],
      ["project/a/one.txt", "file"],
      ["project/b", "folder"],
      ["project/b/two.txt", "file"],
      ["project/gone.txt", "file"],
    ]);
    const ids = before.slice(1).map((n) => n.id);

    // The graph after the edits: a and b swapped, gone.txt deleted, new/notes.md added.
    const after = tree([
      ["project/b", "folder"],
      ["project/b/one.txt", "file"],
      ["project/a", "folder"],
      ["project/a/two.txt", "file"],
      ["project/new/notes.md", "file"],
    ]);
    after[1].id = ids[0];
    after[2].id = ids[1];
    after[3].id = ids[2];
    after[4].id = ids[3];

    const { script } = buildChangesScript({
      baseline: baselineOf(before),
      nodes: after,
      includeDeletions: true,
      fileName: "fewer-changes.sh",
    });
    const file = join(root, "fewer-changes.sh");
    writeFileSync(file, script);

    const run = Bun.spawnSync(["bash", file, "--yes", "--allow-delete"], { cwd: project });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);

    expect(listTree(project)).toEqual([
      "a/two.txt",
      "b/one.txt",
      "new/notes.md",
    ]);
  });
});
