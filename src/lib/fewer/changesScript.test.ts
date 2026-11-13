import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
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
function tree(paths: [string, "file" | "folder"][], root = "project"): FewerNode[] {
  const nodes = paths.map(([path, type]) => node(path, path, type));
  nodes.unshift(node("root", root, "folder", { isRoot: true }));
  return nodes;
}

/** An archive import: the root card IS the archive file. */
function archiveTree(paths: [string, "file" | "folder"][]): FewerNode[] {
  const nodes = paths.map(([path, type]) => node(path, `backup.zip/${path}`, type));
  nodes.unshift(node("root", "backup.zip", "folder", { isRoot: true, isArchive: true }));
  return nodes;
}

function baselineOf(nodes: FewerNode[]): BaselineEntry[] {
  return captureBaseline(nodes);
}

function bashAvailable(): boolean {
  return existsSync("/bin/bash") || existsSync("/usr/bin/bash");
}

/** 7-Zip is the tool the archive replay uses; the tests skip without it. */
function sevenZipAvailable(): boolean {
  for (const candidate of ["7z", "7zz", "7za"]) {
    const found = Bun.spawnSync(["which", candidate]);
    if (found.exitCode === 0) return true;
  }
  return false;
}

/** Python 3 is the fallback engine. */
function pythonAvailable(): boolean {
  return Bun.spawnSync(["which", "python3"]).exitCode === 0;
}

/**
 * Run the script with 7-Zip hidden, so the Python fallback engine is the one
 * that has to do the work.
 *
 * The PATH is rebuilt from symlinks to everything that was on it, minus the
 * 7-Zip binaries — a plain empty PATH would take bash and python3 with it.
 */
function runWithout7z(file: string, cwd: string, args: string[]) {
  const bin = join(mkdtempSync(join(tmpdir(), "fewer-nopath-")), "bin");
  mkdirSync(bin, { recursive: true });
  const hidden = new Set(["7z", "7za", "7zz", "7zr"]);
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (hidden.has(entry)) continue;
      const link = join(bin, entry);
      if (existsSync(link)) continue;
      try {
        symlinkSync(join(dir, entry), link);
      } catch {
        /* a file we cannot link is a file we do not need */
      }
    }
  }
  const env = { ...process.env, PATH: bin };
  return Bun.spawnSync(["bash", file, ...args], { cwd, env });
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

describe("archive replay", () => {
  test("an archive import targets the archive, not a folder", () => {
    const before = archiveTree([["src/a.txt", "file"]]);
    const after = archiveTree([["src/b.txt", "file"]]);
    after[1].id = before[1].id;
    const plan = planChanges(captureBaseline(before), after);
    expect(plan.target).toBe("archive");
    expect(plan.moves).toEqual([{ id: before[1].id, from: "src/a.txt", to: "src/b.txt" }]);
  });

  test("the archive script uses 7-Zip and checks the archive file", () => {
    const before = archiveTree([["src/a.txt", "file"]]);
    const after = archiveTree([["src/b.txt", "file"]]);
    after[1].id = before[1].id;
    const { script, target } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
    });
    expect(target).toBe("archive");
    expect(script).toContain("7-Zip is not installed");
    expect(script).toContain("ARCHIVE_NAME='backup.zip'");
    expect(script).toContain("STAGE_FROM=('src/a.txt')");
    expect(script).toContain("COMMIT_TO=('src/b.txt')");
  });

  test("an expanded zip is edited as an archive, not skipped", () => {
    // The shape from a real export: a folder of zips, edited inside one of
    // them. The zip is a real file in that folder, so the edit belongs to
    // the zip — it is applied to the archive with 7-Zip.
    const before = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Logo.eps", "file"],
        ["test zips/Other.zip", "folder"],
      ],
      "test zips",
    );
    before[1].data.isArchive = true; // the zip card
    before[3].data.isArchive = true;
    const after = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Renamed.eps", "file"],
        ["test zips/Other.zip", "folder"],
      ],
      "test zips",
    );
    after[1].data.isArchive = true;
    after[3].data.isArchive = true;
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    after[3].id = before[3].id;

    const plan = planChanges(captureBaseline(before), after);
    // Nothing happens in the folder itself…
    expect(plan.moves).toHaveLength(0);
    expect(plan.skippedInArchives).toBe(0);
    // …the zip is edited instead, with the paths inside it.
    expect(plan.archivePlans).toHaveLength(1);
    expect(plan.archivePlans[0].archive).toBe("Logos.zip");
    expect(plan.archivePlans[0].moves).toEqual([
      { from: "Logos/Logo.eps", to: "Logos/Renamed.eps" },
    ]);
  });

  test("the fingerprint never samples a path inside an archive", () => {
    // An archive member does not exist on disk, so sampling one would fail
    // the folder check on a folder that is perfectly fine.
    const before = tree([
      ["project/Logos.zip", "folder"],
      ["project/Logos.zip/inner.eps", "file"],
      ["project/real.txt", "file"],
    ]);
    before[1].data.isArchive = true; // the zip card
    const plan = planChanges(captureBaseline(before), before);
    expect(plan.fingerprint.every((path) => !path.includes("Logos.zip/"))).toBe(true);
    expect(plan.fingerprint).toContain("real.txt");
  });

  test("a folder script with archive work carries the archive plan and the engine", () => {
    const before = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Logo.eps", "file"],
      ],
      "test zips",
    );
    before[1].data.isArchive = true;
    const after = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Renamed.eps", "file"],
      ],
      "test zips",
    );
    after[1].data.isArchive = true;
    after[1].id = before[1].id;
    after[2].id = before[2].id;

    const { script, summary, skippedInArchives } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
    });
    expect(summary.total).toBe(1);
    expect(summary.inArchives).toBe(1);
    expect(skippedInArchives).toBe(0);
    // The script carries the engine and the plan for the archive.
    expect(script).toContain("archive_engine");
    expect(script).toContain("ARCHIVE_NAMES[0]='Logos.zip'");
    expect(script).toContain("Logos/Logo.eps");
    expect(script).toContain("apply_archive_plan");
    // The work is counted, so the script does not stop at "nothing to do".
    expect(script).toContain("CHANGES=1");
    expect(script).toContain("1 inside an archive");
  });

  test("the archive script replays a rename, a swap and a deletion", () => {
    if (!sevenZipAvailable()) return;
    const root = mkdtempSync(join(tmpdir(), "fewer-archive-"));
    const archive = join(root, "backup.zip");
    // Build the archive the way the browser would see it.
    const stage = join(root, "stage");
    mkdirSync(join(stage, "src", "deep"), { recursive: true });
    writeFileSync(join(stage, "src", "a.txt"), "A");
    writeFileSync(join(stage, "src", "b.txt"), "B");
    writeFileSync(join(stage, "src", "deep", "c.txt"), "C");
    writeFileSync(join(stage, "gone.txt"), "GONE");
    const pack = Bun.spawnSync(
      ["7z", "a", "-bso0", "-bsp0", archive, "src", "gone.txt"],
      { cwd: stage },
    );
    expect(pack.exitCode).toBe(0);

    const before = archiveTree([
      ["src", "folder"],
      ["src/a.txt", "file"],
      ["src/b.txt", "file"],
      ["src/deep", "folder"],
      ["src/deep/c.txt", "file"],
      ["gone.txt", "file"],
    ]);
    const ids = before.slice(1).map((n) => n.id);

    // a.txt → b.txt and b.txt → a.txt (a swap), c.txt renamed, gone.txt deleted.
    const after = archiveTree([
      ["src", "folder"],
      ["src/b.txt", "file"],
      ["src/a.txt", "file"],
      ["src/deep", "folder"],
      ["src/deep/renamed.txt", "file"],
    ]);
    after[1].id = ids[0];
    after[2].id = ids[1];
    after[3].id = ids[2];
    after[4].id = ids[3];
    after[5].id = ids[4];

    const { script } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
      includeDeletions: true,
      fileName: "fewer-changes.sh",
    });
    const file = join(root, "fewer-changes.sh");
    writeFileSync(file, script);

    const run = Bun.spawnSync(["bash", file, "--yes", "--allow-delete"], { cwd: root });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);

    const out = join(root, "out");
    mkdirSync(out);
    Bun.spawnSync(["7z", "x", "-bso0", "-bsp0", `-o${out}`, archive]);
    // The swap kept each file's bytes, the rename landed, the delete is gone.
    expect(readFileSync(join(out, "src", "a.txt"), "utf8")).toBe("B");
    expect(readFileSync(join(out, "src", "b.txt"), "utf8")).toBe("A");
    expect(readFileSync(join(out, "src", "deep", "renamed.txt"), "utf8")).toBe("C");
    expect(existsSync(join(out, "gone.txt"))).toBe(false);
  });

  test("the archive script adds a new file", () => {
    if (!sevenZipAvailable()) return;
    const root = mkdtempSync(join(tmpdir(), "fewer-archive-add-"));
    const archive = join(root, "backup.zip");
    const stage = join(root, "stage");
    mkdirSync(join(stage, "src"), { recursive: true });
    writeFileSync(join(stage, "src", "a.txt"), "A");
    Bun.spawnSync(["7z", "a", "-bso0", "-bsp0", archive, "src"], { cwd: stage });

    const before = archiveTree([
      ["src", "folder"],
      ["src/a.txt", "file"],
    ]);
    const after = archiveTree([
      ["src", "folder"],
      ["src/a.txt", "file"],
      ["src/new.txt", "file"],
    ]);
    after[1].id = before[1].id;
    after[2].id = before[2].id;

    const { script } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
      fileName: "fewer-changes.sh",
    });
    const file = join(root, "fewer-changes.sh");
    writeFileSync(file, script);

    const run = Bun.spawnSync(["bash", file, "--yes"], { cwd: root });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);

    const out = join(root, "out");
    mkdirSync(out);
    Bun.spawnSync(["7z", "x", "-bso0", "-bsp0", `-o${out}`, archive]);
    expect(existsSync(join(out, "src", "new.txt"))).toBe(true);
  });
test("the Python fallback replays the same changes when 7-Zip is missing", () => {
    if (!pythonAvailable()) return;
    const root = mkdtempSync(join(tmpdir(), "fewer-archive-py-"));
    const archive = join(root, "backup.zip");
    const stage = join(root, "stage");
    mkdirSync(join(stage, "src", "deep"), { recursive: true });
    writeFileSync(join(stage, "src", "a.txt"), "A");
    writeFileSync(join(stage, "src", "b.txt"), "B");
    writeFileSync(join(stage, "src", "deep", "c.txt"), "C");
    writeFileSync(join(stage, "gone.txt"), "GONE");
    Bun.spawnSync(["7z", "a", "-bso0", "-bsp0", archive, "src", "gone.txt"], { cwd: stage });

    const before = archiveTree([
      ["src", "folder"],
      ["src/a.txt", "file"],
      ["src/b.txt", "file"],
      ["src/deep", "folder"],
      ["src/deep/c.txt", "file"],
      ["gone.txt", "file"],
    ]);
    const ids = before.slice(1).map((n) => n.id);
    const after = archiveTree([
      ["src", "folder"],
      ["src/b.txt", "file"],
      ["src/a.txt", "file"],
      ["src/deep", "folder"],
      ["src/deep/renamed.txt", "file"],
    ]);
    after[1].id = ids[0];
    after[2].id = ids[1];
    after[3].id = ids[2];
    after[4].id = ids[3];
    after[5].id = ids[4];

    const { script } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
      includeDeletions: true,
      fileName: "fewer-changes.sh",
    });
    const file = join(root, "fewer-changes.sh");
    writeFileSync(file, script);

    // No 7-Zip on PATH: the script has to fall back to Python.
    const run = runWithout7z(file, root, ["--yes", "--allow-delete"]);
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);

    const out = join(root, "out");
    mkdirSync(out);
    Bun.spawnSync(["7z", "x", "-bso0", "-bsp0", `-o${out}`, archive]);
    expect(readFileSync(join(out, "src", "a.txt"), "utf8")).toBe("B");
    expect(readFileSync(join(out, "src", "b.txt"), "utf8")).toBe("A");
    expect(readFileSync(join(out, "src", "deep", "renamed.txt"), "utf8")).toBe("C");
    expect(existsSync(join(out, "gone.txt"))).toBe(false);
  });

  test("the generated script edits the archive in place", () => {
    if (!sevenZipAvailable()) return;
    // A folder with a zip in it, and a rename inside that zip: the script
    // must edit the zip, not the folder.
    const root = mkdtempSync(join(tmpdir(), "fewer-zip-folder-"));
    const folder = join(root, "test zips");
    mkdirSync(folder, { recursive: true });
    const stage = join(root, "stage");
    mkdirSync(join(stage, "Logos"), { recursive: true });
    writeFileSync(join(stage, "Logos", "Logo.eps"), "EPS");
    writeFileSync(join(stage, "Logos", "Other.eps"), "OTHER");
    Bun.spawnSync(["7z", "a", "-bso0", "-bsp0", join(folder, "Logos.zip"), "Logos"], { cwd: stage });

    const before = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Logo.eps", "file"],
        ["test zips/Logos.zip/Logos/Other.eps", "file"],
      ],
      "test zips",
    );
    before[1].data.isArchive = true;
    const after = tree(
      [
        ["test zips/Logos.zip", "folder"],
        ["test zips/Logos.zip/Logos/Renamed.eps", "file"],
        ["test zips/Logos.zip/Logos/Other.eps", "file"],
      ],
      "test zips",
    );
    after[1].data.isArchive = true;
    after[1].id = before[1].id;
    after[2].id = before[2].id;
    after[3].id = before[3].id;

    const { script } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
      fileName: "fewer-changes.sh",
    });
    const file = join(root, "fewer-changes.sh");
    writeFileSync(file, script);

    const run = Bun.spawnSync(["bash", file, "--yes"], { cwd: folder });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);

    // The zip now holds the renamed entry — the zip was edited in place.
    const out = join(root, "out");
    mkdirSync(out);
    Bun.spawnSync(["7z", "x", "-bso0", "-bsp0", `-o${out}`, join(folder, "Logos.zip")]);
    expect(existsSync(join(out, "Logos", "Renamed.eps"))).toBe(true);
    expect(existsSync(join(out, "Logos", "Logo.eps"))).toBe(false);
    expect(readFileSync(join(out, "Logos", "Renamed.eps"), "utf8")).toBe("EPS");
  });

  test("a folder script only reaches for an archive engine when it has archive work", () => {
    const before = tree([["project/a.txt", "file"]]);
    const after = tree([["project/b.txt", "file"]]);
    after[1].id = before[1].id;
    const { script, target } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
    });
    expect(target).toBe("folder");
    // A folder replay with no archives needs nothing but bash: no archive
    // engine is looked for, and 7-Zip is never mentioned.
    expect(script).not.toContain("7z ");
    expect(script).not.toContain("python3");
    expect(script).not.toContain("archive_engine");
  });

  test("an archive script with nothing to change never asks about an engine", () => {
    const before = archiveTree([["src/a.txt", "file"]]);
    const after = archiveTree([["src/a.txt", "file"]]);
    after[1].id = before[1].id;
    const { script } = buildChangesScript({
      baseline: captureBaseline(before),
      nodes: after,
    });
    // The engine check comes after the "nothing to change" exit.
    expect(script.indexOf("Nothing to change")).toBeLessThan(script.indexOf("pick the engine"));
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
