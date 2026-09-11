"use client";

/**
 * File operations facade — re-exports everything from the focused sub-modules
 * below so existing callers keep working with zero churn:
 *
 *  - `fsPrimitives`  — pure FS Access API operations (no store, no fetch)
 *  - `folderSync`    — folder expand / refresh / local-open (store + fetch)
 *  - `filePaths`     — pure path helpers
 *  - `fileRender`    — pure browser-renderability classification
 *
 * Why this shape: the monolithic fileOps.ts was a churn hotspot (health 2.86,
 * hotspot 93%, 5 bug-fixes in 6 months, 25 co-change partners — shotgun
 * surgery). Splitting logic into the four modules above isolates the IO
 * primitives from the store-coupled sync logic, which was dragging in UI
 * components (CustomNode, KeyboardShortcuts, GraphCanvas) on every change.
 *
 * New code should import from the specific sub-module. This facade exists only
 * for backward compatibility.
 */

export {
  // fsPrimitives
  copyFile,
  moveFile,
  deleteFile,
  deleteDirectory,
  createFile,
  createDirectory,
  renameEntry,
  openFile,
  entryExists,
  getUniqueName,
  getFileMetadata,
} from "./fsPrimitives";

export {
  // folderSync
  expandFolderNode,
  refreshFolderFromDisk,
  resolveRootLocalPath,
  openNodeFile,
  openFolderInExplorer,
  downloadRemoteFile,
} from "./folderSync";

export {
  // filePaths
  nodeAbsolutePath,
} from "./filePaths";

export {
  // fileRender
  RENDERABLE_PREFIXES,
  RENDERABLE_TYPES,
  RENDERABLE_EXT,
  DOWNLOAD_TYPES,
  isBrowserRenderable,
  stripMimeParams,
} from "./fileRender";
