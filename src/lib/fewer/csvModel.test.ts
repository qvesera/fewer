import { describe, expect, test } from "bun:test";
import {
  CSV_EXPORT_HEADERS,
  UNMAPPED,
  cell,
  emptyCsvMapping,
  guessCsvMapping,
  isCsvMappingUsable,
  isExportCsv,
  parseCsvRows,
} from "./csvModel";

describe("parseCsvRows", () => {
  test("splits plain rows and drops blank/comment-only lines", () => {
    const rows = parseCsvRows("id,label\na,x\n\nb,y\n");
    expect(rows).toEqual([
      ["id", "label"],
      ["a", "x"],
      ["b", "y"],
    ]);
  });

  test("keeps embedded commas, doubled quotes and newlines inside quoted fields", () => {
    const rows = parseCsvRows(`id,label\n"1","a, b"\n"2","he said ""hi"""\n"3","line1\nline2"\n`);
    expect(rows[1]).toEqual(["1", "a, b"]);
    expect(rows[2]).toEqual(["2", 'he said "hi"']);
    expect(rows[3]).toEqual(["3", "line1\nline2"]);
  });

  test("strips a UTF-8 BOM (Excel exports) and tolerates CRLF", () => {
    const rows = parseCsvRows("\uFEFFid,label\r\na,x\r\n");
    expect(rows[0]).toEqual(["id", "label"]);
    expect(rows[1]).toEqual(["a", "x"]);
  });
});

describe("isExportCsv", () => {
  test("recognizes our own export header", () => {
    expect(isExportCsv(CSV_EXPORT_HEADERS)).toBe(true);
  });

  test("rejects a reordered or partial header", () => {
    expect(isExportCsv(["id", "label", "path"])).toBe(false);
    expect(isExportCsv(["label", "id", "path", "type", "extension", "category", "size_bytes", "symlink_target"])).toBe(false);
  });
});

describe("guessCsvMapping", () => {
  test("maps common header spellings, case- and separator-insensitive", () => {
    const map = guessCsvMapping(["Full Path", "Name", "Kind", "Ext", "Symlink Target", "Parent ID"]);
    expect(map).toMatchObject({ name: 1, path: 0, type: 2, extension: 3, symlinkTarget: 4, parent: 5 });
  });

  test("leaves unmatched roles unmapped (-1)", () => {
    const map = guessCsvMapping(["col_a", "col_b"]);
    expect(map.name).toBe(UNMAPPED);
    expect(isCsvMappingUsable(map)).toBe(false);
  });

  test("a lone column falls back to name (a pasted list of paths)", () => {
    const map = guessCsvMapping(["whatever"]);
    expect(map.name).toBe(0);
    expect(isCsvMappingUsable(map)).toBe(true);
  });

  test("each column maps to at most one role", () => {
    // "file" is an alias for both name and path — the earlier role wins it.
    const map = guessCsvMapping(["file"]);
    expect(map.name).toBe(0);
    expect(map.path).toBe(-1);
  });
});

describe("cell", () => {
  test("returns trimmed text, and '' for a missing or unmapped column", () => {
    expect(cell([" a ", "b"], 0)).toBe("a");
    expect(cell(["a"], 5)).toBe("");
    expect(cell(["a"], -1)).toBe("");
  });

  test("emptyCsvMapping starts fully unmapped", () => {
    expect(Object.values(emptyCsvMapping()).every((v) => v === UNMAPPED)).toBe(true);
  });
});
