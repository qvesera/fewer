import { describe, expect, test } from "bun:test";
import {
  expandArchives,
  expandNotes,
  isArchiveName,
  MAX_EXPANDED_ARCHIVES,
  takeLastExpansion,
} from "./archiveExpand";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import type { ImportOptions } from "./importOptions";
import type { TreeEntry } from "./types";

const enc = new TextEncoder();

/* ── fixture: a real zip's bytes, built by hand (no archive library) ── */

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}
function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A stored-method zip with a central directory — enough for listArchive. */
function zipOf(members: { name: string; size?: number }[]): Blob {
  const locals: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let offset = 0;
  for (const m of members) {
    const nameBytes = enc.encode(m.name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    locals.push(local);

    const rec = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint32(16, offset, true);
    dv.setUint32(24, m.size ?? 0, true);
    dv.setUint16(28, nameBytes.length, true);
    rec.set(nameBytes, 46);
    cd.push(rec);
    offset += local.length;
  }
  const localsBytes = concat(locals);
  const cdBytes = concat(cd);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, members.length, true);
  ev.setUint16(10, members.length, true);
  ev.setUint32(12, cdBytes.length, true);
  ev.setUint32(16, localsBytes.length, true);
  return new Blob([localsBytes, cdBytes, eocd] as BlobPart[]);
}

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  ...DEFAULT_IMPORT_OPTIONS,
  expandArchives: true,
  ...over,
});

/** Tree with one file leaf at a known path, plus the blob to hand back. */
function treeWith(name: string, blob: Blob | null, size = 1): TreeEntry {
  return {
    name: "root",
    type: "folder",
    children: [{ name, type: "file", size, archiveBlob: blob ?? undefined }],
  };
}

const readerFor =
  (blob: Blob | null) =>
  async () =>
    blob;

describe("isArchiveName", () => {
  test.each([
    ["a.zip", true], ["a.ZIP", true], ["a.tar", true], ["a.tar.gz", true],
    ["a.tgz", true], ["a.7z", true], ["a.rar", true], ["a.tar.zst", true],
    ["a.txt", false], ["zip", false], ["a.zipper", false], ["zipfile", false],
  ])("%s → %p", (name, expected) => {
    expect(isArchiveName(name)).toBe(expected);
  });
});

describe("expandArchives", () => {
  test("does nothing when the option is off", async () => {
    const zip = zipOf([{ name: "src/index.ts", size: 12 }]);
    const tree = treeWith("release.zip", zip);
    const result = await expandArchives(
      tree,
      readerFor(zip),
      opts({ expandArchives: false }),
    );

    expect(result.expanded).toBe(0);
    expect(tree.children![0]!.type).toBe("file");
    expect(tree.children![0]!.children).toBeUndefined();
  });

  test("promotes an archive leaf to a container with its listing", async () => {
    const zip = zipOf([
      { name: "src/index.ts", size: 12 },
      { name: "README.md", size: 3 },
    ]);
    const tree = treeWith("release.zip", zip);

    const result = await expandArchives(tree, readerFor(zip), opts());

    expect(result.expanded).toBe(1);
    expect(result.members).toBe(2);
    const node = tree.children![0]!;
    expect(node.type).toBe("folder");
    expect(node.isArchive).toBe(true);
    expect(node.children?.map((c) => c.name)).toEqual(["src", "README.md"]);
    expect(node.children?.[0]?.children?.[0]?.size).toBe(12);
  });

  test("expands archives nested in ordinary folders", async () => {
    const zip = zipOf([{ name: "a.txt", size: 1 }]);
    const tree: TreeEntry = {
      name: "root",
      type: "folder",
      children: [
        {
          name: "dist",
          type: "folder",
          children: [
            { name: "bundle.zip", type: "file", size: 1, archiveBlob: zip },
          ],
        },
      ],
    };

    const result = await expandArchives(
      tree,
      async (_entry, fullPath) => (fullPath === "dist/bundle.zip" ? zip : null),
      opts(),
    );

    expect(result.expanded).toBe(1);
    expect(tree.children![0]!.children![0]!.isArchive).toBe(true);
  });

  test("leaves an archive inside an archive as a file (one level only)", async () => {
    const inner = zipOf([{ name: "deep.txt", size: 1 }]);
    const outer = zipOf([{ name: "inner.zip", size: 10 }]);
    const tree = treeWith("outer.zip", outer);

    const result = await expandArchives(
      tree,
      async (entry) => (entry.name === "outer.zip" ? outer : inner),
      opts(),
    );

    expect(result.expanded).toBe(1);
    // inner.zip is still a file — we do not recurse into a listing.
    const innerNode = tree.children![0]!.children![0]!;
    expect(innerNode.name).toBe("inner.zip");
    expect(innerNode.type).toBe("file");
  });

  test("records a skip when the reader returns null", async () => {
    const tree = treeWith("broken.zip", null);
    const result = await expandArchives(tree, readerFor(null), opts());

    expect(result.expanded).toBe(0);
    expect(result.skipped[0]).toContain("broken.zip");
    expect(tree.children![0]!.type).toBe("file");
  });

  test("records a skip when the bytes are not an archive", async () => {
    const junk = new Blob([enc.encode("definitely not a zip")]);
    const tree = treeWith("fake.zip", junk);
    const result = await expandArchives(tree, readerFor(junk), opts());

    expect(result.expanded).toBe(0);
    expect(result.skipped[0]).toContain("fake.zip");
  });

  test("ignores non-archive files entirely", async () => {
    const zip = zipOf([{ name: "a.txt", size: 1 }]);
    const tree = treeWith("notes.md", zip);
    const result = await expandArchives(tree, readerFor(zip), opts());

    expect(result.expanded).toBe(0);
    expect(result.skipped).toEqual([]);
  });

  test("stops at the archive-count ceiling", async () => {
    const zip = zipOf([{ name: "a.txt", size: 1 }]);
    const tree: TreeEntry = {
      name: "root",
      type: "folder",
      children: Array.from({ length: MAX_EXPANDED_ARCHIVES + 3 }, (_, i) => ({
        name: `a${i}.zip`,
        type: "file" as const,
        size: 1,
        archiveBlob: zip,
      })),
    };

    const result = await expandArchives(tree, readerFor(zip), opts());

    expect(result.expanded).toBe(MAX_EXPANDED_ARCHIVES);
    expect(tree.children!.filter((c) => c.isArchive)).toHaveLength(
      MAX_EXPANDED_ARCHIVES,
    );
    expect(result.skipped.some((s) => s.includes("stopped after"))).toBe(true);
  });

  test("maxDepth bounds how far inside the archive the graph reaches", async () => {
    const zip = zipOf([
      { name: "one/two/three/deep.txt", size: 1 },
      { name: "top.txt", size: 1 },
    ]);
    const tree = treeWith("a.zip", zip);

    // maxDepth 1 → only the archive's own top level survives.
    await expandArchives(tree, readerFor(zip), opts({ maxDepth: 1 }));
    const node = tree.children![0]!;
    expect(node.children?.map((c) => c.name)).toEqual(["one", "top.txt"]);
    expect(node.children?.[0]?.children).toEqual([]);

    // maxDepth 0 (unlimited) → the full listing is kept.
    const wide = treeWith("b.zip", zip);
    await expandArchives(wide, readerFor(zip), opts({ maxDepth: 0 }));
    const wideNode = wide.children![0]!;
    expect(
      wideNode.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.name,
    ).toBe("deep.txt");
  });

  test("caps a whole-read archive but not a seekable zip", async () => {
    const zip = zipOf([{ name: "a.txt", size: 1 }]);
    const big = 65 * 1024 * 1024; // over the 64 MB whole-read limit

    // .7z must be read whole by the engine — refused above the limit.
    const sevenZ = treeWith("huge.7z", zip, big);
    const r1 = await expandArchives(sevenZ, readerFor(zip), opts());
    expect(r1.expanded).toBe(0);
    expect(r1.skipped[0]).toContain("64 MB limit");

    // .zip is a cheap seek — always attempted, whatever its size.
    const bigZip = treeWith("huge.zip", zip, big);
    const r2 = await expandArchives(bigZip, readerFor(zip), opts());
    expect(r2.expanded).toBe(1);
  });
});

describe("expandNotes", () => {
  test("is empty when nothing was skipped", () => {
    expect(expandNotes({ expanded: 2, skipped: [], members: 10 })).toEqual([]);
  });

  test("collapses many skips into one note with a count", () => {
    const skipped = Array.from({ length: 5 }, (_, i) => `a${i}.zip (bad)`);
    const notes = expandNotes({ expanded: 0, skipped, members: 0 });

    expect(notes).toHaveLength(1);
    expect(notes[0]!.description).toContain("a0.zip");
    expect(notes[0]!.description).toContain("+2 more");
  });
});

describe("takeLastExpansion", () => {
  test("reports the latest run and clears it", async () => {
    const zip = zipOf([{ name: "a.txt", size: 1 }]);
    const tree = treeWith("a.zip", zip);
    await expandArchives(tree, readerFor(zip), opts());

    const first = takeLastExpansion();
    expect(first?.expanded).toBe(1);
    expect(takeLastExpansion()).toBeNull();
  });
});