/**
 * Feature switches for local-filesystem capabilities that rely on
 * browser-only machinery:
 *
 *  - the File System Access API (`showDirectoryPicker`, directory handles)
 *  - server-side OS openers (`/api/open-folder`, `/api/open-file` — they spawn
 *    explorer/open/xdg-open on the machine running the dev server)
 *  - OS drag-and-drop of folders onto the canvas
 *
 * The web build supports none of them today: the opener routes are dev-only,
 * `showDirectoryPicker` is Chromium-only, and reading `DataTransfer.files`
 * outside our own packaged Chromium is what the portalised-Chromium crash
 * hazard warns about (dropImport.ts). Flags stay so the web can flip them
 * without touching call sites.
 *
 * What intentionally still works: folder import via the legacy
 * `<input webkitdirectory>` picker, file / URL / cloud imports, and in-app node
 * drag & drop (custom DataTransfer payload, no item access).
 */

export const LOCAL_FS_FEATURES = {
  /** "Open in File Explorer" (folder context menu + Alt+O). */
  openInOs: false,
  /** "Open File" (file context menu + Enter). */
  openFileInOs: false,
  /** External OS folder drop on the canvas → import. */
  dragDropImport: false,
  /** Drop a disk-backed folder child onto the canvas to expand it from disk. */
  dropToExpand: false,
  /** File System Access API directory picker (showDirectoryPicker). */
  fsaDirectoryPicker: false,
} as const;

// ── Server-dependent features ───────────────────────────────────────────────
// The web app is the host with the server; every surface below ships there.
// The map stays so call sites read as "server feature" rather than hardcoding
// true in a dozen components.
export type CloudFeature =
  | "accounts"        // sign-in, profile edits, account deletion
  | "cloudSave"       // /api/graphs cloud-saved projects
  | "share"           // share dialogs, short links, invite tokens
  | "gallery"         // community galleries + theme gallery publish
  | "cloudImport"     // OneDrive/GDrive connectors + server-backed URL import
  | "watch"           // watched indexes + nightly email digests
  | "versionHistory"  // /api/graphs/[id]/versions snapshots
  | "billing"         // Stripe checkout / customer portal
  | "bugEmail";       // Web3Forms email fallback in the bug report

export const CLOUD_FEATURES: Record<CloudFeature, boolean> = {
  accounts: true,
  cloudSave: true,
  share: true,
  gallery: true,
  cloudImport: true,
  watch: true,
  versionHistory: true,
  billing: true,
  bugEmail: true,
};

/** Server-feature check used by components. */
export function cloudFeature(feature: CloudFeature): boolean {
  return CLOUD_FEATURES[feature];
}

