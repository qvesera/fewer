/**
 * List the folder structure inside a local archive so it can be drawn on the
 * canvas like any other import.
 *
 * Only the LISTING is read — never the file contents. That is what keeps this
 * dependency-free:
 *  - zip stores its full directory listing uncompressed in the central
 *    directory, so the archive body never has to be read. We fetch the last
 *    64 KB (EOCD) and then the central directory, both via Blob.slice.
 *  - tar stores its listing in plain 512-byte headers, so we walk headers and
 *    skip each entry's payload by its declared size.
 *  - .tar.gz / .tgz / .gz is the same tar walk behind the browser's native
 *    DecompressionStream("gzip").
 *
 * Formats needing a full decompressor (7z, RAR, xz, bzip2, Zstandard) are
 * routed to the lazily-loaded wasm engine in archiveEngine.ts, which is only
 * fetched when one of those is actually opened.
 */
import type { TreeEntry } from "./types";
import { sortFoldersFirst } from "./treeSort";

/** Hard cap on members materialized into nodes. */
export const MAX_ARCHIVE_ENTRIES = 20000;

export type ArchiveFormat = "zip" | "tar" | "tar.gz" | "gzip" | "engine";

export interface ArchiveListing {
  /** Root node is the archive file itself; children are its members. */
  tree: TreeEntry;
  /** Members actually added to the tree. */
  entries: number;
  /** True when the archive held more members than MAX_ARCHIVE_ENTRIES. */
  truncated: boolean;
  format: ArchiveFormat;
}

/** One archive member: a slash-separated path, whether it is a directory, and its size. */
export interface Member {
  path: string;
  isDir: boolean;
  size: number;
}

/** A listing before the format tag is attached. Shared with the wasm engine. */
export interface BaseListing {
  tree: TreeEntry;
  entries: number;
  truncated: boolean;
}

const utf8 = new TextDecoder("utf-8");

/**
 * Formats only the wasm engine can read. Recognized by magic bytes so the
 * router sends them to archiveEngine instead of failing.
 */
const ENGINE_FORMATS: { magic: number[]; label: string }[] = [
  { magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], label: "7-Zip (.7z)" },
  { magic: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], label: "RAR" },
  { magic: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], label: "xz (.tar.xz)" },
  { magic: [0x42, 0x5a, 0x68], label: "bzip2 (.tar.bz2)" },
  { magic: [0x28, 0xb5, 0x2f, 0xfd], label: "Zstandard (.tar.zst)" },
];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

function nameOf(file: Blob): string {
  return (file as File).name || "archive";
}

/* ─────────────────────────── entry point ─────────────────────────── */

export async function listArchive(file: Blob): Promise<ArchiveListing> {
  const rootName = nameOf(file);
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());

  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    return { ...(await fromZip(file, rootName)), format: "zip" };
  }
  if (startsWith(head, [0x1f, 0x8b])) {
    return listGzip(file, rootName);
  }
  // tar has no file-level magic; the ustar marker lives in the first header.
  if (utf8.decode(head.subarray(257, 262)) === "ustar") {
    return { ...(await fromTar(blobSource(file), rootName)), format: "tar" };
  }

  // 7z / RAR / xz / bzip2 / zstd need a full decompressor, which the browser
  // does not provide — hand those to the lazily-loaded wasm engine.
  for (const { magic } of ENGINE_FORMATS) {
    if (startsWith(head, magic)) {
      const { listWithEngine } = await import("./archiveEngine");
      return { ...(await listWithEngine(file, rootName)), format: "engine" };
    }
  }
  throw new Error("Not a zip, tar, .tar.gz, 7z, RAR, xz, bzip2, or Zstandard archive.");
}

async function listGzip(file: Blob, rootName: string): Promise<ArchiveListing> {
  const source = await streamSource(
    file.stream().pipeThrough(new DecompressionStream("gzip")),
  );
  const head = new Uint8Array(await source.read(512));

  if (utf8.decode(head.subarray(257, 262)) === "ustar") {
    // Re-attach the block we consumed so the tar walk sees a whole stream.
    return {
      ...(await fromTar(replaySource(source, head), rootName)),
      format: "tar.gz",
    };
  }
  // A single compressed file (foo.txt.gz) has no internal structure, so it
  // contributes exactly one member.
  return {
    tree: {
      name: rootName,
      type: "folder",
      children: [
        { name: rootName.replace(/\.gz$/i, "") || rootName, type: "file", size: 0 },
      ],
    },
    entries: 1,
    truncated: false,
    format: "gzip",
  };
}

/* ─────────────────────────────── zip ─────────────────────────────── */

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const ZIP64_EXTRA = 0x0001;

/** End-of-central-directory lives in the last 22 bytes + a ≤64 KB comment. */
const EOCD_SCAN_BYTES = 66_000;

async function fromZip(file: Blob, rootName: string): Promise<BaseListing> {
  const tail = new Uint8Array(
    await file.slice(file.size - Math.min(file.size, EOCD_SCAN_BYTES)).arrayBuffer(),
  );
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Zip file is truncated (no central directory).");

  let cdSize = view.getUint32(eocd + 12, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  // zip64: the 32-bit fields saturate and the real values live in a separate
  // record, pointed at by a locator sitting just before the EOCD.
  const locator = eocd - 20;
  if (
    (cdSize === 0xffffffff || cdOffset === 0xffffffff) &&
    locator >= 0 &&
    view.getUint32(locator, true) === EOCD64_LOCATOR_SIG
  ) {
    const eocd64Offset = Number(view.getBigUint64(locator + 8, true));
    const record = new Uint8Array(
      await file.slice(eocd64Offset, eocd64Offset + 56).arrayBuffer(),
    );
    const rv = new DataView(record.buffer, record.byteOffset, record.byteLength);
    if (rv.getUint32(0, true) !== EOCD64_SIG) {
      throw new Error("Zip64 end-of-archive record is unreadable.");
    }
    cdSize = Number(rv.getBigUint64(40, true));
    cdOffset = Number(rv.getBigUint64(48, true));
  }

  const cd = new Uint8Array(
    await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer(),
  );
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);

  const members: Member[] = [];
  let p = 0;
  let truncated = false;
  while (p + 46 <= cd.length) {
    if (dv.getUint32(p, true) !== CENTRAL_SIG) break;
    if (members.length >= MAX_ARCHIVE_ENTRIES) {
      truncated = true;
      break;
    }
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen));
    const size =
      dv.getUint32(p + 24, true) === 0xffffffff
        ? zip64UncompressedSize(cd, p + 46 + nameLen, extraLen)
        : dv.getUint32(p + 24, true);

    if (name) {
      // A trailing slash marks a directory. Writers often omit directory
      // entries entirely; toListing re-creates them from the member paths.
      members.push({ path: name, isDir: name.endsWith("/"), size });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }

  return { ...toListing(rootName, members), truncated };
}

/** Uncompressed size from the zip64 extended information extra field. */
function zip64UncompressedSize(cd: Uint8Array, start: number, extraLen: number): number {
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  let p = start;
  const end = start + extraLen;
  while (p + 4 <= end) {
    const id = dv.getUint16(p, true);
    const size = dv.getUint16(p + 2, true);
    if (id === ZIP64_EXTRA) {
      // usize, csize, offset — each present only when its 32-bit field
      // saturated, in that fixed order. The first is the uncompressed size.
      return Number(dv.getBigUint64(p + 4, true));
    }
    p += 4 + size;
  }
  return 0;
}

/* ─────────────────────────────── tar ─────────────────────────────── */

/** Sequential byte reader; the only thing the tar walk needs. */
interface ByteSource {
  read(n: number): Promise<Uint8Array>;
  /** Advance past n bytes without materializing them. */
  skip(n: number): Promise<void>;
}

function blobSource(blob: Blob): ByteSource {
  let pos = 0;
  return {
    async read(n) {
      const chunk = new Uint8Array(await blob.slice(pos, pos + n).arrayBuffer());
      pos += chunk.length;
      return chunk;
    },
    async skip(n) {
      // A Blob is randomly addressable, so a skip is just arithmetic — this is
      // what lets a multi-GB tar walk without reading its payload.
      pos += n;
    },
  };
}

async function streamSource(stream: ReadableStream<Uint8Array>): Promise<ByteSource> {
  const reader = stream.getReader();
  let buffered = new Uint8Array(0);
  const read = async (n: number) => {
    while (buffered.length < n) {
      const { done, value } = await reader.read();
      if (done) break;
      const merged = new Uint8Array(buffered.length + (value?.length ?? 0));
      merged.set(buffered);
      if (value) merged.set(value, buffered.length);
      buffered = merged;
    }
    const out = buffered.subarray(0, n);
    buffered = buffered.subarray(n);
    return out;
  };
  return {
    read,
    async skip(n) {
      // A decompressed stream has no seek, so discard what we would have read.
      let left = n;
      while (left > 0) {
        const step = Math.min(left, 65_536);
        await read(step);
        left -= step;
      }
    },
  };
}

/** Re-attach an already-consumed prefix so a walk can start mid-stream. */
function replaySource(source: ByteSource, head: Uint8Array): ByteSource {
  let pending = head;
  return {
    read: async (n) => {
      if (pending.length === 0) return source.read(n);
      const out = pending.subarray(0, n);
      pending = pending.subarray(out.length);
      return out;
    },
    skip: (n) => source.skip(n),
  };
}

const TAR_BLOCK = 512;

function tarSize(header: Uint8Array): number {
  // Sizes are octal ASCII ("00000000123\0"), except GNU's base-256 encoding for
  // values that do not fit — the high bit of the first byte flags that.
  if (header[124] & 0x80) {
    let value = header[124] & 0x7f;
    for (let i = 125; i < 136; i++) value = value * 256 + header[i];
    return value;
  }
  const parsed = parseInt(utf8.decode(header.subarray(124, 136)).replace(/[\0 ]/g, ""), 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimNul(value: string): string {
  const end = value.indexOf("\0");
  return end === -1 ? value : value.slice(0, end);
}

async function fromTar(source: ByteSource, rootName: string): Promise<BaseListing> {
  const members: Member[] = [];
  let longName: string | null = null;
  let truncated = false;

  for (;;) {
    const header = new Uint8Array(await source.read(TAR_BLOCK));
    if (header.length < TAR_BLOCK) break;
    if (header.every((b) => b === 0)) break; // end-of-archive marker

    const size = tarSize(header);
    const padding = (TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK;
    const type = header[156];

    if (type === 0x4c /* 'L' GNU long name */) {
      longName = trimNul(utf8.decode(new Uint8Array(await source.read(size))));
    } else if (type === 0x78 /* 'x' pax header */ || type === 0x67 /* 'g' pax global */) {
      // Metadata only — the member it describes follows with its own header.
      await source.skip(size);
    } else {
      const name = longName ?? trimNul(utf8.decode(header.subarray(0, 100)));
      longName = null;
      if (members.length >= MAX_ARCHIVE_ENTRIES) {
        truncated = true;
        break;
      }
      const isDir = type === 0x35 /* '5' */ || name.endsWith("/");
      if (name) members.push({ path: name, isDir, size: isDir ? 0 : size });
      await source.skip(size);
    }
    if (padding > 0) await source.skip(padding);
  }

  return { ...toListing(rootName, members), truncated };
}

/* ────────────────────────── members → tree ───────────────────────── */

/**
 * Build a TreeEntry from slash-separated member paths. Parent directories that
 * the archive never declared are created as the walk goes, so archives without
 * directory entries still render their full shape.
 *
 * Exported so the wasm engine (T-051) produces an identical tree shape from
 * libarchive's member list.
 */
export function toListing(rootName: string, members: Member[]): Omit<BaseListing, "truncated"> {
  const root: TreeEntry = { name: rootName, type: "folder", children: [] };

  for (const member of members) {
    const segments = member.path.split("/").filter((s) => s !== "" && s !== ".");
    if (segments.length === 0) continue;

    let parent = root;
    segments.forEach((segment, i) => {
      const isLeaf = i === segments.length - 1;
      const existing = (parent.children ?? []).find((child) => child.name === segment);
      if (existing) {
        if (!isLeaf) {
          existing.children ??= [];
          parent = existing;
        }
        return;
      }
      const entry: TreeEntry = isLeaf
        ? { name: segment, type: member.isDir ? "folder" : "file", size: member.size }
        : { name: segment, type: "folder", children: [] };
      parent.children = parent.children ?? [];
      parent.children.push(entry);
      if (!isLeaf) parent = entry;
    });
  }

  sortChildren(root);
  return { tree: root, entries: members.length };
}

function sortChildren(entry: TreeEntry): void {
  if (!entry.children) return;
  sortFoldersFirst(entry.children);
  for (const child of entry.children) sortChildren(child);
}
