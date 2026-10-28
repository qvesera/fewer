/**
 * Expand archives found INSIDE an imported folder, so `imports/` shows the
 * tree of a `release.zip` sitting next to it rather than one opaque file card.
 *
 * The whole design turns on one injected seam:
 *
 *   ArchiveReader = (entry, fullPath) => Promise<Blob | null>
 *
 * `expandArchives` never touches a file API itself — it asks the reader for
 * bytes. Each import channel supplies its own reader (a File map from the
 * webkitdirectory picker, `getFile()` on a File System Access handle, the
 * legacy entry API, or fs.readFile on the server-side walk). A future native
 * core (T-063) is just another reader, which is why the size caps below can be
 * relaxed in exactly one place when that lands.
 *
 * A reader returns null — never throws — for "cannot read this" (unsupported,
 * too big, failed). The policy layer above turns those into one aggregate note
 * instead of failing the whole import.
 */
import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { listArchive } from "./archiveList";
import { sortTreeFoldersFirst } from "./treeSort";

/**
 * Supplies an archive's bytes for one entry, or null when it cannot.
 * `fullPath` is the entry's slash-joined path inside the imported root.
 */
export type ArchiveReader = (
  entry: TreeEntry,
  fullPath: string,
) => Promise<Blob | null>;

/** Archive extensions we attempt to expand. Matches the picker's accept list. */
const ARCHIVE_EXTS = new Set([
  "zip", "tar", "gz", "tgz",
  "7z", "rar", "xz", "bz2", "zst",
  "tar.gz", "tar.xz", "tar.bz2", "tar.zst",
]);

/**
 * Formats whose listing is a cheap seek (zip's central directory, tar's
 * headers), so we always try them. Everything else must read the whole
 * archive — gzip has to inflate every byte, and the wasm engine copies the
 * file into its heap — which is why those are size-capped. A native core
 * (T-063) removes the reason for the cap.
 */
const SEEKABLE_EXTS = new Set(["zip", "tar"]);
const WHOLE_READ_LIMIT_BYTES = 64 * 1024 * 1024;

/** Per-import ceilings, so a folder of huge archives cannot blow up the graph. */
export const MAX_EXPANDED_ARCHIVES = 200;
export const MAX_EXPANDED_MEMBERS = 50_000;

export interface ExpandResult {
  /** How many archives became container nodes. */
  expanded: number;
  /** Human-readable reasons for archives we declined to expand. */
  skipped: string[];
  /** Total members added across every expanded archive. */
  members: number;
}

interface Note {
  title: string;
  description: string;
}

/** Extension without the dot, lowercased. Handles the two-part .tar.* forms. */
function archiveExt(name: string): string | null {
  const lower = name.toLowerCase();
  for (const ext of ["tar.gz", "tar.xz", "tar.bz2", "tar.zst"]) {
    if (lower.endsWith(`.${ext}`)) return ext;
  }
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = lower.slice(dot + 1);
  return ARCHIVE_EXTS.has(ext) ? ext : null;
}

/** True when the name looks like an archive we know how to list. */
export function isArchiveName(name: string): boolean {
  return archiveExt(name) !== null;
}

/**
 * The most recent expansion, kept so the folder import can surface one toast
 * explaining anything it declined to expand. The expansion itself happens deep
 * inside whichever channel walker ran (only that side holds the bytes), so the
 * result is handed back through here rather than by threading a return value
 * through four walkers and their callers.
 */
let lastExpansion: ExpandResult | null = null;

export function takeLastExpansion(): ExpandResult | null {
  const result = lastExpansion;
  lastExpansion = null;
  return result;
}

/**
 * Drop folders deeper than `maxLevels` below the archive root, mirroring how
 * filterTree prunes past maxDepth. maxDepth 0 means unlimited.
 *
 * The archive counts as one directory, so the same slider that bounds the disk
 * walk also bounds how far inside the archive the graph reaches.
 */
function trimToDepth(children: TreeEntry[], maxLevels: number): TreeEntry[] {
  if (maxLevels <= 0) return children;
  const walk = (nodes: TreeEntry[], level: number): TreeEntry[] =>
    nodes.map((node) =>
      node.type === "folder" && node.children
        ? { ...node, children: level >= maxLevels ? [] : walk(node.children, level + 1) }
        : node,
    );
  return walk(children, 1);
}

/**
 * Walk a freshly built tree and expand every archive leaf into a container.
 *
 * Mutates the tree in place. Must run BEFORE the caller prunes empty folders
 * and sorts, or an expanded archive's children get pruned as an empty dir.
 */
export async function expandArchives(
  root: TreeEntry,
  reader: ArchiveReader,
  options: ImportOptions,
): Promise<ExpandResult> {
  const result: ExpandResult = { expanded: 0, skipped: [], members: 0 };
  if (!options.expandArchives) return result;

  // `depth` counts archive nesting, so we never expand an archive that was
  // found inside another archive (one level only).
  const walk = async (
    node: TreeEntry,
    prefix: string,
    depth: number,
  ): Promise<void> => {
    if (!node.children) return;
    for (const child of node.children) {
      const fullPath = prefix ? `${prefix}/${child.name}` : child.name;
      const ext = archiveExt(child.name);

      if (child.type === "file" && ext) {
        if (depth > 0) continue; // archive inside an archive: stays a file
        if (await expandOne(child, fullPath, ext, reader, options, result)) {
          // Walk the archive's own children so they get sorted, still without
          // expanding any nested archive (the depth guard above).
          await walk(child, fullPath, depth + 1);
        }
        continue;
      }
      await walk(child, fullPath, depth);
    }
  };

  await walk(root, "", 0);
  sortTreeFoldersFirst(root);
  lastExpansion = result;
  return result;
}

async function expandOne(
  entry: TreeEntry,
  fullPath: string,
  ext: string,
  reader: ArchiveReader,
  options: ImportOptions,
  result: ExpandResult,
): Promise<boolean> {
  if (result.expanded >= MAX_EXPANDED_ARCHIVES) {
    result.skipped.push(`stopped after ${MAX_EXPANDED_ARCHIVES} archives`);
    return false;
  }
  const size = entry.size ?? 0;
  if (!SEEKABLE_EXTS.has(ext) && size > WHOLE_READ_LIMIT_BYTES) {
    const mb = Math.round(size / 1048576);
    result.skipped.push(
      `${entry.name} (${mb} MB, over the ${WHOLE_READ_LIMIT_BYTES / 1048576} MB limit)`,
    );
    return false;
  }

  let blob: Blob | null = null;
  try {
    blob = await reader(entry, fullPath);
  } catch {
    blob = null;
  }
  if (!blob) {
    result.skipped.push(`${entry.name} (could not be read)`);
    return false;
  }

  try {
    const listing = await listArchive(blob);
    // Promote the file leaf to a container so it renders like a folder holding
    // its listing, flagged so disk actions can skip it.
    entry.type = "folder";
    entry.isArchive = true;
    entry.children = trimToDepth(listing.tree.children ?? [], options.maxDepth);
    result.expanded += 1;
    result.members += listing.entries;
    if (listing.truncated) {
      result.skipped.push(`${entry.name} (truncated at 20,000 entries)`);
    }
    return true;
  } catch (err) {
    const why = err instanceof Error ? err.message : "unsupported";
    result.skipped.push(`${entry.name} (${why})`);
    return false;
  }
}

/**
 * Turn the skipped list into at most one toast, so a folder of 50 unreadable
 * archives does not produce 50 notifications.
 */
export function expandNotes(result: ExpandResult): Note[] {
  if (result.skipped.length === 0) return [];
  const shown = result.skipped.slice(0, 3).join("; ");
  const more =
    result.skipped.length > 3 ? ` (+${result.skipped.length - 3} more)` : "";
  return [
    {
      title: "Some archives were not expanded",
      description: `${shown}${more}`,
    },
  ];
}