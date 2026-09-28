import { describe, expect, test } from "bun:test";
import { listArchive, MAX_ARCHIVE_ENTRIES } from "./archiveList";
import type { TreeEntry } from "./types";

/* ── fixture builders (no archive library: build the bytes by hand) ── */

const enc = new TextEncoder();

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}
function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}
function u64(v: number): Uint8Array {
  return concat([u32(v), u32(Math.floor(v / 2 ** 32))]);
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
function pad(n: number): Uint8Array {
  return new Uint8Array((512 - (n % 512)) % 512);
}
function named(blob: Blob, name: string): File {
  return new File([blob], name);
}
async function gzip(blob: Blob): Promise<Blob> {
  const stream = new Blob([await blob.arrayBuffer()] as BlobPart[]).stream();
  return new Response(stream.pipeThrough(new CompressionStream("gzip"))).blob();
}
function find(node: TreeEntry, path: string[]): TreeEntry | undefined {
  let cur: TreeEntry | undefined = node;
  for (const segment of path) cur = cur?.children?.find((c) => c.name === segment);
  return cur;
}
const names = (node: TreeEntry) => node.children?.map((c) => c.name) ?? [];

/* ── zip ── */

interface ZipMember {
  name: string;
  size: number;
  /** Store the true 64-bit size in the zip64 extra field (usize saturated). */
  zip64?: boolean;
}

/**
 * A real-shaped zip: local header + stored payload, then the central
 * directory and the EOCD. Only the directory half is read back, but the
 * leading local header is what the magic-byte sniff sees.
 */
function buildZip(members: ZipMember[], name = "test.zip"): File {
  const locals: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let offset = 0;

  for (const m of members) {
    const nameBytes = enc.encode(m.name);
    const extra =
      m.zip64 ? concat([u16(0x0001), u16(16), u64(m.size), u64(0), u64(0)]) : new Uint8Array(0);

    const local = new Uint8Array(30 + nameBytes.length + extra.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 20, true);
    lv.setUint32(18, m.size, true);
    lv.setUint32(22, m.size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, extra.length, true);
    local.set(nameBytes, 30);
    local.set(extra, 30 + nameBytes.length);
    // A zero-length payload keeps the fixture small: the size lives in the
    // header, which is all the listing reads.
    locals.push(local);

    const rec = new Uint8Array(46 + nameBytes.length + extra.length);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint32(16, offset, true); // local header offset
    dv.setUint32(24, m.zip64 ? 0xffffffff : m.size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, extra.length, true);
    rec.set(nameBytes, 46);
    rec.set(extra, 46 + nameBytes.length);
    cd.push(rec);

    offset += local.length;
  }

  const localsBytes = concat(locals);
  const cdBytes = concat(cd);
  const eocd = new Uint8Array(22);
  const eocdv = new DataView(eocd.buffer);
  eocdv.setUint32(0, 0x06054b50, true);
  eocdv.setUint16(8, members.length, true);
  eocdv.setUint16(10, members.length, true);
  eocdv.setUint32(12, cdBytes.length, true);
  eocdv.setUint32(16, localsBytes.length, true);
  return named(new Blob([localsBytes, cdBytes, eocd] as BlobPart[]), name);
}

describe("listArchive — zip", () => {
  test("reads the central directory without touching the payload", async () => {
    const file = buildZip(
      [
        { name: "docs/", size: 0 },
        { name: "docs/readme.md", size: 120 },
        { name: "src/", size: 0 },
        { name: "src/index.ts", size: 42 },
        { name: "package.json", size: 8 },
      ],
      "backup.zip",
    );
    const listing = await listArchive(file);

    expect(listing.format).toBe("zip");
    expect(listing.tree.name).toBe("backup.zip");
    expect(listing.tree.type).toBe("folder");
    expect(names(listing.tree)).toEqual(["docs", "src", "package.json"]);
    expect(find(listing.tree, ["docs", "readme.md"])?.size).toBe(120);
    expect(find(listing.tree, ["src", "index.ts"])?.type).toBe("file");
  });

  test("creates parent directories the archive never declared", async () => {
    const listing = await listArchive(buildZip([{ name: "a/b/c/deep.txt", size: 7 }]));
    expect(find(listing.tree, ["a", "b", "c", "deep.txt"])?.size).toBe(7);
    expect(find(listing.tree, ["a", "b", "c"])?.type).toBe("folder");
  });

  test("reads a zip64 size out of the extended information field", async () => {
    const listing = await listArchive(
      buildZip([{ name: "big.bin", size: 5_000_000_000, zip64: true }]),
    );
    expect(find(listing.tree, ["big.bin"])?.size).toBe(5_000_000_000);
  });

  test("flags truncation past the entry cap", async () => {
    const many = Array.from({ length: MAX_ARCHIVE_ENTRIES + 5 }, (_, i) => ({
      name: `f${i}.txt`,
      size: 1,
    }));
    const listing = await listArchive(buildZip(many));
    expect(listing.truncated).toBe(true);
    expect(listing.entries).toBe(MAX_ARCHIVE_ENTRIES);
  });

  test("an empty zip yields a bare root", async () => {
    const listing = await listArchive(buildZip([]));
    expect(listing.entries).toBe(0);
    expect(names(listing.tree)).toEqual([]);
  });

  test("a truncated zip names the missing central directory", async () => {
    const file = buildZip([{ name: "a.txt", size: 1 }]);
    const bytes = new Uint8Array((await file.arrayBuffer()).slice(0, 30));
    await expect(
      listArchive(named(new Blob([bytes] as BlobPart[]), "cut.zip")),
    ).rejects.toThrow(/truncated/i);
  });
});

/* ── tar ── */

/** One ustar file header; directories carry typeflag "5" and a trailing slash. */
function tarHeader(name: string, size: number, typeflag: string): Uint8Array {
  const h = new Uint8Array(512);
  const put = (text: string, at: number, len: number) =>
    h.set(enc.encode(text).subarray(0, len), at);
  put(name, 0, 100);
  put(octal(0o644, 8), 100, 8); // mode
  put(octal(0, 8), 108, 8); // uid
  put(octal(0, 8), 116, 8); // gid
  put(octal(size, 12), 124, 12);
  put(octal(0, 12), 136, 12); // mtime
  h[156] = typeflag.charCodeAt(0);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  h.fill(0x20, 148, 156); // the checksum field counts as spaces while summing
  let sum = 0;
  for (const b of h) sum += b;
  put(octal(sum, 8), 148, 8);
  return h;
}

function buildTar(
  members: { name: string; body?: string; dir?: boolean }[],
  name = "dump.tar",
): File {
  const chunks: Uint8Array[] = [];
  for (const m of members) {
    if (m.dir) {
      chunks.push(tarHeader(`${m.name.replace(/\/$/, "")}/`, 0, "5"));
    } else {
      const data = enc.encode(m.body ?? "x");
      chunks.push(tarHeader(m.name, data.length, "0"), data, pad(data.length));
    }
  }
  chunks.push(new Uint8Array(1024)); // end-of-archive marker
  return named(new Blob(chunks as BlobPart[]), name);
}

describe("listArchive — tar", () => {
  test("walks headers and sizes", async () => {
    const listing = await listArchive(
      buildTar([
        { name: "top", dir: true },
        { name: "top/one.txt", body: "hello" },
        { name: "top/nested", dir: true },
        { name: "top/nested/two.txt", body: "12345" },
      ]),
    );

    expect(listing.format).toBe("tar");
    expect(listing.tree.name).toBe("dump.tar");
    expect(names(listing.tree)).toEqual(["top"]);
    expect(find(listing.tree, ["top", "one.txt"])?.size).toBe(5);
    expect(find(listing.tree, ["top", "nested", "two.txt"])?.size).toBe(5);
    expect(names(find(listing.tree, ["top"])!)).toEqual(["nested", "one.txt"]);
  });

  test("skips a GNU long-name entry and uses its payload", async () => {
    const longName = `${"deep/".repeat(12)}file.txt`;
    const payload = enc.encode(`${longName}\0`);
    const linkHeader = tarHeader("././@LongLink", payload.length, "0");
    linkHeader[156] = 0x4c; // 'L'
    const data = enc.encode("x");
    const listing = await listArchive(
      named(
        new Blob([
          linkHeader,
          payload,
          pad(payload.length),
          tarHeader(longName.slice(0, 100), data.length, "0"),
          data,
          pad(data.length),
          new Uint8Array(1024),
        ] as BlobPart[]),
        "l.tar",
      ),
    );

    const segments = longName.split("/");
    expect(find(listing.tree, segments)).toBeDefined();
    expect(find(listing.tree, segments)?.type).toBe("file");
    // The truncated 100-byte name in the header must NOT be what we used.
    expect(listing.tree.children?.[0].name).toBe("deep");
  });

  test("flags truncation past the entry cap", async () => {
    const many = Array.from({ length: MAX_ARCHIVE_ENTRIES + 3 }, (_, i) => ({
      name: `f${i}.txt`,
      body: "y",
    }));
    const listing = await listArchive(buildTar(many, "big.tar"));
    expect(listing.truncated).toBe(true);
    expect(listing.entries).toBe(MAX_ARCHIVE_ENTRIES);
  });
});

/* ── gzip ── */

describe("listArchive — gzip", () => {
  test("inflates a .tar.gz through the native stream", async () => {
    const tarGz = await gzip(
      buildTar([
        { name: "pkg", dir: true },
        { name: "pkg/main.py", body: "print(1)" },
      ]),
    );
    const listing = await listArchive(named(tarGz, "bundle.tar.gz"));

    expect(listing.format).toBe("tar.gz");
    expect(find(listing.tree, ["pkg", "main.py"])?.size).toBe(8);
  });

  test("a single compressed file contributes one member", async () => {
    const gz = await gzip(new Blob([enc.encode("plain text")]));
    const listing = await listArchive(named(gz, "notes.txt.gz"));

    expect(listing.format).toBe("gzip");
    expect(names(listing.tree)).toEqual(["notes.txt"]);
    expect(listing.tree.children?.[0].type).toBe("file");
  });
});

/* ── rejections ── */

describe("listArchive — unsupported input", () => {
  const CASES: [number[], string][] = [
    [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], "7-Zip"],
    [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00], "RAR"],
    [[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], "xz"],
    [[0x42, 0x5a, 0x68, 0x39], "bzip2"],
    [[0x28, 0xb5, 0x2f, 0xfd], "Zstandard"],
  ];

  for (const [magic, label] of CASES) {
    test(`names the format it cannot read (${label})`, async () => {
      const bytes = new Uint8Array(64);
      magic.forEach((b, i) => (bytes[i] = b));
      await expect(
        listArchive(named(new Blob([bytes] as BlobPart[]), "x.bin")),
      ).rejects.toThrow(label);
    });
  }

  test("random bytes are not an archive", async () => {
    await expect(
      listArchive(named(new Blob([enc.encode("just some text")] as BlobPart[]), "a.txt")),
    ).rejects.toThrow(/not a zip, tar/i);
  });
});