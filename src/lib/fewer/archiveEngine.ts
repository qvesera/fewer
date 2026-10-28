/**
 * Lazily-loaded WebAssembly archive engine for the formats the browser cannot
 * read on its own: 7-Zip, RAR, xz, bzip2, and Zstandard.
 *
 * This is the T-051 half of archive import. The zero-dependency fast path in
 * archiveList.ts handles zip / tar / tar.gz / gz without any decompressor; this
 * module reaches for libarchive.js (a WASM build of libarchive) only when the
 * magic bytes say one of the engine-only formats. Neither the ~1 MB wasm nor
 * the worker is fetched unless a user actually opens such an archive.
 *
 * The engine's `getFilesArray()` lists members WITHOUT decompressing their
 * data, which is exactly what we need to draw a tree — same as the fast path.
 *
 * Asset wiring: the browser build resolves its worker as
 * `new URL("./worker-bundle.js", import.meta.url)`, which bundlers mangle, so
 * the worker and wasm are copied to /libarchive/ by scripts/vendor-libarchive.ts
 * and we point Archive.init at that stable path.
 */
import { toListing, MAX_ARCHIVE_ENTRIES } from "./archiveList";
import type { BaseListing, Member } from "./archiveList";

/** Where the vendored worker + wasm are served from. */
const WORKER_URL = "/libarchive/worker-bundle.js";

type Archive = Awaited<ReturnType<typeof import("libarchive.js").Archive.open>>;

/**
 * Shape of libarchive's getFilesObject() result: a nested map whose keys are
 * member names, whose values are CompressedFile leaves (with .name/.size),
 * nested folder objects, or null for an empty folder.
 */
interface EngineNode {
  [name: string]: unknown;
}

let initialised: Promise<void> | null = null;

/**
 * Import the engine and point it at the vendored worker. Runs at most once;
 * concurrent callers share the same in-flight promise.
 */
async function ensureEngine(): Promise<typeof import("libarchive.js")> {
  initialised ??= (async () => {
    const { Archive } = await import("libarchive.js");
    Archive.init({ workerUrl: WORKER_URL });
  })();
  await initialised;
  return import("libarchive.js");
}

/**
 * List a 7z/RAR/xz/bz2/zstd archive via the wasm engine.
 *
 * Reads the whole archive into the worker's memory (the engine is not
 * seekable), so a single very large archive costs real memory. The member cap
 * bounds node count, not engine memory.
 */
export async function listWithEngine(
  file: Blob,
  rootName: string,
): Promise<BaseListing> {
  const { Archive } = await ensureEngine();

  // Archive.open wants a File (it reads name/type), so wrap a Blob if needed.
  const input =
    file instanceof File ? file : new File([await file.arrayBuffer()], rootName);

  const archive: Archive = await Archive.open(input);
  try {
    // getFilesObject() returns a nested object mirroring the archive tree:
    // each leaf is a CompressedFile (with .name and .size), each folder is a
    // plain object, and an empty folder is null. That maps directly to what we
    // want, unlike getFilesArray(), whose flat entries carry the CONTAINING
    // folder in .path rather than the full member path.
    const tree = (await archive.getFilesObject()) as unknown as EngineNode;
    const members: Member[] = [];
    let truncated = false;

    const walk = (node: Record<string, unknown>, prefix: string): void => {
      for (const [name, value] of Object.entries(node)) {
        if (members.length >= MAX_ARCHIVE_ENTRIES) {
          truncated = true;
          return;
        }
        const path = prefix ? `${prefix}/${name}` : name;
        if (value === null || value === undefined) {
          // An empty folder (libarchive represents it as null).
          members.push({ path, isDir: true, size: 0 });
        } else if (typeof value === "object" && "size" in value) {
          // A CompressedFile leaf.
          const size = (value as { size?: number }).size;
          members.push({ path, isDir: false, size: typeof size === "number" ? size : 0 });
        } else {
          walk(value as Record<string, unknown>, path);
        }
      }
    };
    walk(tree as unknown as Record<string, unknown>, "");

    return { ...toListing(rootName, members), truncated };
  } finally {
    // Terminate the worker so a finished listing does not hold the archive in
    // memory; libarchive spawns one worker per open().
    await archive.close().catch(() => {});
  }
}