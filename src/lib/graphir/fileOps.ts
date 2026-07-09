"use client";

/**
 * Real file system operations using the File System Access API.
 * These functions actually modify files on disk — not just the graph.
 *
 * All functions require a FileSystemDirectoryHandle or FileSystemFileHandle
 * obtained via showDirectoryPicker() or showOpenFilePicker().
 */

/**
 * Copy a file from one directory to another on disk.
 */
export async function copyFile(
  sourceHandle: FileSystemFileHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string
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
 * If target is the same directory, uses handle.move() instead.
 */
export async function moveFile(
  sourceHandle: FileSystemFileHandle,
  sourceDir: FileSystemDirectoryHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string
): Promise<FileSystemFileHandle> {
  const name = newName || sourceHandle.name;

  // If same directory, just rename
  if (sourceDir === targetDir && !newName) {
    return sourceHandle; // nothing to do
  }

  if (sourceDir === targetDir && newName) {
    // Use move() for rename within same dir (if supported)
    const moveable = sourceHandle as unknown as { move?: (name: string) => Promise<void> };
    if (typeof moveable.move === "function") {
      try {
        await moveable.move!(newName);
        return sourceHandle;
      } catch {
        // Fallback to copy + delete
      }
    }
  }

  // Copy to target, then delete source
  const newHandle = await copyFile(sourceHandle, targetDir, name);
  await sourceDir.removeEntry(sourceHandle.name);
  return newHandle;
}

/**
 * Delete a file from disk permanently.
 * Note: Browser FS API does not support "trash" — this is permanent.
 */
export async function deleteFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> {
  await dirHandle.removeEntry(fileName);
}

/**
 * Delete a directory from disk (recursive).
 */
export async function deleteDirectory(
  parentDir: FileSystemDirectoryHandle,
  dirName: string
): Promise<void> {
  await parentDir.removeEntry(dirName, { recursive: true });
}

/**
 * Create a new empty file in the given directory.
 */
export async function createFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string | Blob = ""
): Promise<FileSystemFileHandle> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

/**
 * Create a new directory.
 */
export async function createDirectory(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<FileSystemDirectoryHandle> {
  return parentHandle.getDirectoryHandle(dirName, { create: true });
}

/**
 * Rename a file or folder on disk.
 * Uses handle.move() if available, otherwise copy + delete.
 */
export async function renameEntry(
  handle: FileSystemHandle,
  newName: string
): Promise<void> {
  if (typeof (handle as unknown as { move?: (n: string) => Promise<void> }).move === "function") {
    try {
      await (handle as unknown as { move: (n: string) => Promise<void> }).move(newName);
      return;
    } catch {
      // Fallback below
    }
  }
  // No fallback possible without the parent handle — caller should handle this
  throw new Error("Rename not supported on this browser");
}

/**
 * Open a file in a new browser tab using an object URL.
 * Works for images, PDFs, text, video, audio, etc.
 */
export async function openFile(handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, "_blank");
  // Revoke after 60 seconds to allow viewing
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Get file metadata (size, type, last modified).
 */
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

/**
 * Check if a file or directory exists in the given directory.
 */
export async function entryExists(
  dirHandle: FileSystemDirectoryHandle,
  name: string
): Promise<"file" | "directory" | null> {
  try {
    await dirHandle.getFileHandle(name);
    return "file";
  } catch {
    try {
      await dirHandle.getDirectoryHandle(name);
      return "directory";
    } catch {
      return null;
    }
  }
}

/**
 * Get a unique name by appending " copy" if the name already exists.
 */
export async function getUniqueName(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string
): Promise<string> {
  const exists = await entryExists(dirHandle, baseName);
  if (!exists) return baseName;

  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : "";

  let counter = 1;
  while (true) {
    const candidate = `${stem} copy${counter > 1 ? ` ${counter}` : ""}${ext}`;
    const exists2 = await entryExists(dirHandle, candidate);
    if (!exists2) return candidate;
    counter++;
  }
}
