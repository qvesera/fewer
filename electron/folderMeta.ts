/**
 * Per-folder metadata store (T-203): tags and groups the user attached while
 * exploring a folder root, kept next to the search index in the app's own
 * data directory — one JSON file per root, named by the SHA-1 of the root
 * path so any characters a filesystem allows are safe in a filename.
 *
 * Pure Node (fs + crypto) so bun can unit-test it; no electron imports.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Hard cap on one root's metadata document (tags/groups are tiny). */
export const META_MAX_BYTES = 5 * 1024 * 1024;

export function metaDir(baseDir: string): string {
  return path.join(baseDir, "folder-meta");
}

export function metaPathFor(baseDir: string, root: string): string {
  const hash = createHash("sha1").update(root).digest("hex");
  return path.join(metaDir(baseDir), `${hash}.json`);
}

/** Read one root's metadata document; null when absent or unreadable. */
export async function readFolderMeta(baseDir: string, root: string): Promise<string | null> {
  try {
    return await fs.readFile(metaPathFor(baseDir, root), "utf8");
  } catch {
    return null;
  }
}

/** Write one root's metadata document (atomic-ish: temp file + rename). */
export async function writeFolderMeta(baseDir: string, root: string, contents: string): Promise<void> {
  if (contents.length > META_MAX_BYTES) throw new Error("folder metadata too large");
  const dir = metaDir(baseDir);
  await fs.mkdir(dir, { recursive: true });
  const target = metaPathFor(baseDir, root);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, target);
}

/** Delete one root's metadata document; reports whether a file went away. */
export async function removeFolderMeta(baseDir: string, root: string): Promise<boolean> {
  try {
    await fs.rm(metaPathFor(baseDir, root));
    return true;
  } catch {
    return false;
  }
}