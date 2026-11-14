import { describe, expect, test } from "bun:test";
import { buildChangesBatchScript, type ChangesPlan } from "./changesScript";

function makePlan(overrides: Partial<ChangesPlan> = {}): ChangesPlan {
  return {
    rootName: "project",
    baselineCount: 5,
    target: "folder",
    moves: [{ id: "m1", from: "a.txt", to: "b.txt" }],
    commitOrder: [0],
    mkdirs: ["newfolder"],
    touches: ["newfile.txt"],
    links: [],
    copies: [{ from: "src.txt", to: "dst.txt" }],
    preDeletes: ["old.txt"],
    deletes: ["gone.txt"],
    fingerprint: ["keep.txt"],
    archivePlans: [],
    warnings: [],
    skippedInArchives: 0,
    ...overrides,
  };
}

describe("buildChangesBatchScript", () => {
  test("generates a CRLF-terminated batch script with @echo off and pause", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script.startsWith("@echo off")).toBe(true);
    expect(script.trimEnd()).toContain("pause");
    expect(script).toContain("\r\n");
    expect(script.endsWith("\r\n")).toBe(true);
  });

  test("emits mkdir for new folders", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain('mkdir /p "!MKDIRS_%%i!"');
  });

  test("emits type nul > for new files", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain('type nul > "!TOUCHES_%%i!"');
  });

  test("emits copy for duplicated files", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain('copy /Y "!COPIES_FROM_%%i!" "!COPIES_TO_%%i!"');
  });

  test("emits rd / del for deletions", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain('rd /s /q "!DELETE_PATHS_%%i!"');
  });

  test("stages moves aside before committing (swap-safe)", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain('move /y "!MOVES_FROM_%%i!"');
    expect(script).toContain(".fewer-tmp-");
    expect(script).toContain('move /y "!from!" "!to!"');
  });

  test("asks before applying deletions", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain("Also delete %DELETES% item(s)?");
    expect(script).toContain("ALLOW_DELETE");
  });

  test("has wrong-folder guard", () => {
    const { script } = buildChangesBatchScript(makePlan(), "2026-01-15T10:00:00.000Z");
    expect(script).toContain(":wrongFolder");
    expect(script).toContain("ROOT_NAME");
  });

  test("archive target produces a note-only script", () => {
    const { script, summary } = buildChangesBatchScript(
      makePlan({ target: "archive", rootName: "backup.zip" }),
      "2026-01-15T10:00:00.000Z",
    );
    expect(script).toContain("archive file");
    expect(script).toContain("7-Zip: open the archive");
    expect(script).toContain("bash fewer-changes.sh");
    expect(summary.total).toBe(0);
    expect(script).toContain("pause");
  });

  test("archivePlans in a folder target show a 7-Zip/WSL note", () => {
    const { script } = buildChangesBatchScript(
      makePlan({
        archivePlans: [{ archive: "Logs.zip", moves: [], preDeletes: [], deletes: [], adds: [], copies: [] }],
      }),
      "2026-01-15T10:00:00.000Z",
    );
    expect(script).toContain("7-Zip or WSL/Git Bash");
    expect(script).toContain("bash fewer-changes.sh");
  });
});
