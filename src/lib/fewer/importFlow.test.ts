import { describe, expect, test } from "bun:test";
import {
  ARCHIVE_ACCEPT,
  ARCHIVE_EXTENSIONS,
  ORIGIN_META,
  defaultFileSource,
  defaultSourceFor,
  isArchiveFileName,
  isSourceReady,
  sourceLabel,
  type OriginSource,
} from "./importFlow";
import { formatBytes } from "./stats";

const text = (over: Partial<Extract<OriginSource, { origin: "file"; kind: "text" }>> = {}) =>
  ({ origin: "file", kind: "text", content: "root\n└── child", format: "tree", ...over }) as OriginSource;

const archive = (file: File | null) =>
  ({ origin: "file", kind: "archive", file, name: "backup.zip" }) as OriginSource;

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
    // Our export header → straight to step 2.
    expect(
      isSourceReady(
        text({
          content: "id,label,path,type,extension,category,size_bytes,symlink_target",
          format: "csv",
        }),
      ),
    ).toBe(true);
    // A header with no name column and no stored mapping → blocked.
    expect(
      isSourceReady(text({ content: "col_a,col_b\n1,2", format: "csv" })),
    ).toBe(false);
    // A header the guess resolves (single column → name) → ready.
    expect(isSourceReady(text({ content: "name\na.ts", format: "csv" }))).toBe(true);
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
