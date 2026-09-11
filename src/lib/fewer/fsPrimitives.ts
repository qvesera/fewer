/**
 * Low-level File System Access API primitives.
 *
 * Each function performs exactly one disk operation and has NO dependency on
 * the graph store, fetch, or DOM beyond the FS API itself — keeping this module
 * free of the shotgun-surgery co-change pattern that the old monolithic
 * fileOps.ts suffered from (25 co-change partners, 5 fixes in 6 months).
 *
 * `moveFile` and `entryExists` were flattened here to clear the nested-complexity
 * biomarkers (moveFile was nesting-4 / CCN-7; entryExists had a swallowed catch).
 */

/** Copy a file from one directory to another on disk. */
export async function copyFile(
  sourceHandle: FileSystemFileHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string,
): Promise<FileSystemFileHandle> {
  const file = await sourceHandle.getFile();
  const name = newName || sourceHandle.name;
  const newHandle = await targetDir.getFileHandle(name, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return newHandle;
}

/**
 * Move a file to a different directory (copy + delete source).
 * If target is the same directory, uses handle.move() when available.
 *
 * Flattened control flow — early returns instead of nested conditionals.
 */
export async function moveFile(
  sourceHandle: FileSystemFileHandle,
  sourceDir: FileSystemDirectoryHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string,
): Promise<FileSystemFileHandle> {
  const name = newName || sourceHandle.name;

  // Same directory, no rename requested: nothing to do.
  if (sourceDir === targetDir && !newName) {
    return sourceHandle;
  }

  // Same directory with a new name: try the move() primitive first.
  if (sourceDir === targetDir) {
    const moved = await trySameDirRename(sourceHandle, name);
    if (moved) return sourceHandle;
  }

  // Cross-directory move (or same-dir rename fallback): copy then delete.
  const newHandle = await copyFile(sourceHandle, targetDir, name);
  await sourceDir.removeEntry(sourceHandle.name);
  return newHandle;
}

/** Try handle.move() for same-dir rename. Returns true on success. */
async function trySameDirRename(
  handle: FileSystemFileHandle,
  name: string,
): Promise<boolean> {
  const movable = handle as unknown as { move?: (name: string) => Promise<void> };
  if (typeof movable.move !== "function") return false;
  try {
    await movable.move!(name);
    return true;
  } catch {
    return false;
  }
}

/** Delete a file from disk permanently (browser FS API has no trash). */
export async function deleteFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  await dirHandle.removeEntry(fileName);
}

/** Delete a directory from disk (recursive). */
export async function deleteDirectory(
  parentDir: FileSystemDirectoryHandle,
  dirName: string,
): Promise<void> {
  await parentDir.removeEntry(dirName, { recursive: true });
}

/** Create a new empty file in the given directory. */
export async function createFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string | Blob = "",
): Promise<FileSystemFileHandle> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

/** Create a new directory. */
export async function createDirectory(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<FileSystemDirectoryHandle> {
  return parentHandle.getDirectoryHandle(dirName, { create: true });
}

/**
 * Rename a file or folder on disk via handle.move() when available.
 * Throws when the browser lacks move() — caller handles the fallback.
 */
export async function renameEntry(
  handle: FileSystemHandle,
  newName: string,
): Promise<void> {
  const movable = handle as unknown as { move?: (n: string) => Promise<void> };
  if (typeof movable.move === "function") {
    try {
      await movable.move(newName);
      return;
    } catch {
      // Fall through to throw below.
    }
  }
  throw new Error("Rename not supported on this browser");
}

/** Open a file in a new browser tab via object URL. */
export async function openFile(handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


/**
 * Check if a file or directory exists in the given directory.
 * Tries file first, then directory, returns null if neither.
 */
export async function entryExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<"file" | "directory" | null> {
  if (await fileExists(dirHandle, name)) return "file";
  if (await dirExists(dirHandle, name)) return "directory";
  return null;
}

async function fileExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dirHandle.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** Get a unique name by appending " copy" if the name already exists. */
export async function getUniqueName(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<string> {
  if (!(await entryExists(dirHandle, baseName))) return baseName;

  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";

  let counter = 1;
  while (true) {
    const candidate = `${stem} copy${counter > 1 ? ` ${counter}` : ""}${ext}`;
    if (!(await entryExists(dirHandle, candidate))) return candidate;
    counter++;
  }
}

/** Get file metadata (size, type, last modified). */
export async function getFileMetadata(handle: FileSystemFileHandle): Promise<{
  name: string;
  size: number;
  type: string;
  lastModified: number;
}> {
  const file = await handle.getFile();
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}
