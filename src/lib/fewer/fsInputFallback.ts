"use client";

import type { TreeEntry } from "./types";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { VENDORED_DIRS } from "./importOptions";
import { isExtAllowed } from "./fsFilters";

function filterInputFiles(
  allFiles: File[],
  options: ImportOptions
): File[] {
  return allFiles.filter((file) => {
    const parts = file.webkitRelativePath.split("/");
    // Check hidden (applies to any path segment)
    if (!options.includeHidden && parts.some((p) => p.startsWith("."))) return false;
    // Check vendored (applies to any path segment)
    if (!options.includeVendored && parts.some((p) => VENDORED_DIRS.has(p))) return false;
    // Check depth (parts.length - 1 = depth from root)
    if (options.maxDepth > 0 && parts.length - 1 > options.maxDepth) return false;
    // Check extension (only when includeFiles is true)
    if (options.includeFiles && !isExtAllowed(file.name, options)) return false;
    return true;
  });
}

function insertInputPath(tree: TreeEntry, parts: string[], file: File) {
  let current = tree;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      current.children = current.children ?? [];
      current.children.push({
        name: part,
        type: "file",
        size: file.size,
      });
    } else {
      current.children = current.children ?? [];
      let next = current.children.find(
        (c) => c.type === "folder" && c.name === part
      );
      if (!next) {
        next = { name: part, type: "folder", children: [] };
        current.children.push(next);
      }
      current = next;
    }
  }
}

function buildTreeFromFileList(allFiles: File[], filteredFiles: File[]): TreeEntry {
  const rootName = allFiles[0].webkitRelativePath.split("/")[0] || "root";
  const tree: TreeEntry = { name: rootName, type: "folder", children: [] };

  // Sort by path to ensure parents are processed first
  filteredFiles.sort((a, b) =>
    a.webkitRelativePath.localeCompare(b.webkitRelativePath)
  );

  for (const file of filteredFiles) {
    const parts = file.webkitRelativePath.split("/").slice(1); // drop root
    insertInputPath(tree, parts, file);
  }
  return tree;
}

function removeEmptyFolders(entry: TreeEntry): boolean {
  if (!entry.children || entry.children.length === 0) {
    return entry.type === "file"; // keep files, mark folders for removal
  }
  entry.children = entry.children.filter((child) => {
    if (child.type === "folder") return removeEmptyFolders(child);
    return true; // always keep files
  });
  return entry.children.length > 0;
}

function sortTree(entry: TreeEntry) {
  if (!entry.children) return;
  entry.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of entry.children) sortTree(c);
}

function showInputPicker(): Promise<FileList | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.onchange = () => {
      input.remove();
      resolve(input.files);
    };

    input.onerror = () => {
      input.remove();
      reject(new Error("Directory selection failed."));
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Fallback method using <input type="file" webkitdirectory>.
 * Processes the flat file list and reconstructs the directory hierarchy
 * from webkitRelativePath. Applies the same ImportOptions filtering.
 */
export async function pickDirectoryViaInput(
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS
): Promise<TreeEntry | null> {
  const files = await showInputPicker();
  const allFiles = Array.from(files ?? []);
  if (allFiles.length === 0) return null;

  const filteredFiles = filterInputFiles(allFiles, options);
  const tree = buildTreeFromFileList(allFiles, filteredFiles);

  // When includeFiles is false, we can't tell if a folder had files
  // (webkitdirectory only gives us file paths), so skip this check
  if (options.skipEmptyFolders && options.includeFiles) {
    removeEmptyFolders(tree);
  }

  sortTree(tree);
  return tree;
}