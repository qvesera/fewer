import { describe, expect, test } from "bun:test";
import {
  ARCHIVE_ACCEPT,
  ARCHIVE_EXTENSIONS,
  ORIGIN_META,
  defaultFileSource,
  defaultSourceFor,
  isArchiveFileName,
  isSourceReady,
  resolveFileFormat,
  sourceLabel,
  type OriginSource,
  type TextFileSource,
} from "./importFlow";
import { formatBytes } from "./stats";

const text = (over: Partial<Extract<OriginSource, { origin: "file"; kind: "text" }>> = {}) =>
  ({ origin: "file", kind: "text", content: "root\n└── child", format: "tree", formatOverride: null, ...over }) as OriginSource;

const archive = (file: File | null) =>
  ({ origin: "file", kind: "archive", file, name: "backup.zip" }) as OriginSource;

/**
 * Build a text source the way the panel does: the format is RESOLVED from the
 * content, never hand-set — so these tests pin what a user would actually get.
 */
const textFrom = (content: string, over: Partial<TextFileSource> = {}): OriginSource =>
  ({ origin: "file", kind: "text", content, ...resolveFileFormat(content, null), ...over }) as OriginSource;

describe("isSourceReady — the file origin's two payloads", () => {
  test("text: empty content is not ready, non-empty is", () => {
    expect(isSourceReady(text({ content: "   " }))).toBe(false);
    expect(isSourceReady(text())).toBe(true);
  });

  test("archive: ready only once a file is picked", () => {
    expect(isSourceReady(archive(null))).toBe(false);
    expect(isSourceReady(archive(new File(["x"], "backup.zip")))).toBe(true);
  });

  test("text csv: our own export needs no mapping, a foreign one needs a usable guess", () => {
    // Our export header → detected as csv, and its header needs no mapping.
    expect(
      isSourceReady(textFrom("id,label,path,type,extension,category,size_bytes,symlink_target")),
    ).toBe(true);
    // A header with no name column and no stored mapping → blocked.
    expect(isSourceReady(textFrom("col_a,col_b\n1,2"))).toBe(false);
    // The same single-column list forced to CSV by the override → the guess
    // resolves name, so the gate opens. Unforced it detects as tree, where no
    // mapping is involved at all.
    expect(isSourceReady(textFrom("name\na.ts", resolveFileFormat("name\na.ts", "csv")))).toBe(
      true,
    );
  });
});

describe("resolveFileFormat — detection folded with the user's intent", () => {
  test("no override → the detected format", () => {
    expect(resolveFileFormat('{ "nodes": [] }', null).format).toBe("json");
    expect(resolveFileFormat("id,label,path\nr,show", null).format).toBe("csv");
    expect(resolveFileFormat("root/\n├── a", null).format).toBe("tree");
  });

  test("an override wins over detection, and survives a content change", () => {
    expect(resolveFileFormat("root/\n├── a", "csv")).toEqual({
      format: "csv",
      formatOverride: "csv",
    });
    // Editing keeps the override — a tweak must not flip them back to tree.
    expect(resolveFileFormat("root/\n├── a\n└── b", "csv").format).toBe("csv");
  });

  test("an override naming no real format is dropped", () => {
    const bogus = "pdf" as "csv";
    expect(resolveFileFormat('{ "nodes": [] }', bogus)).toEqual({
      format: "json",
      formatOverride: null,
    });
  });

  test("empty content resolves to tree with no override", () => {
    expect(resolveFileFormat("", null)).toEqual({ format: "tree", formatOverride: null });
  });
});

describe("sourceLabel — the step-3 summary", () => {
  test("text payload reports the format and line count", () => {
    expect(sourceLabel(text({ format: "csv", content: "a\nb\nc" }))).toBe("CSV payload, 3 lines");
  });

  test("archive payload reports the name and size", () => {
    const file = new File(["x"], "backup.zip");
    expect(sourceLabel(archive(file))).toBe(`backup.zip (${formatBytes(file.size)})`);
  });

  test("archive payload with no file says so", () => {
    expect(sourceLabel(archive(null))).toBe("No archive selected");
  });
});

describe("defaultFileSource — the mode switch", () => {
  test("starts in text mode with the ASCII-tree format", () => {
    const s = defaultSourceFor("file");
    expect(s).toMatchObject({ origin: "file", kind: "text", format: "tree" });
  });

  test("switching to archive clears the text payload", () => {
    const s = defaultFileSource("archive");
    expect(s).toMatchObject({ origin: "file", kind: "archive", file: null, name: "" });
  });

  test("switching back to text clears the archive payload", () => {
    const s = defaultSourceFor("file");
    expect(s).toMatchObject({ origin: "file", kind: "text" });
    expect("file" in s ? s.file : undefined).toBeUndefined();
  });
});

describe("isArchiveFileName — the UI mode hint", () => {
  test("matches every reader extension, including compound ones", () => {
    for (const ext of ARCHIVE_EXTENSIONS) {
      expect(isArchiveFileName(`bundle.${ext}`)).toBe(true);
    }
  });

  test("is case-insensitive and needs the leading dot", () => {
    expect(isArchiveFileName("BUNDLE.TGZ")).toBe(true);
    expect(isArchiveFileName("a.tar.gz")).toBe(true);
    expect(isArchiveFileName("gz")).toBe(false);
    expect(isArchiveFileName("notes.txt")).toBe(false);
  });
});

describe("the fold is pinned at the contract level", () => {
  test("archive is not an origin, and its extensions ride in the accept list", () => {
    expect(Object.keys(ORIGIN_META)).not.toContain("archive");
    expect(ARCHIVE_ACCEPT).toContain(".zip");
    expect(ARCHIVE_ACCEPT).toContain(".tar.gz");
    expect(ARCHIVE_ACCEPT).toContain(".7z");
  });

  test("the file blurb advertises archives", () => {
    expect(ORIGIN_META.file.blurb.toLowerCase()).toContain("archive");
  });
});
