/**
 * Feature switches for local-filesystem capabilities that rely on
 * browser-only machinery:
 *
 *  - the File System Access API (`showDirectoryPicker`, directory handles)
 *  - server-side OS openers (`/api/open-folder`, `/api/open-file` — they spawn
 *    explorer/open/xdg-open on the machine running the dev server)
 *  - OS drag-and-drop of folders onto the canvas
 *
 * None of these exist or are reliable inside a non-browser shell (e.g. a
 * Tauri webview): there is no Next.js server to spawn openers, no
 * showDirectoryPicker in WKWebView/WebKitGTK, and OS file drops are
 * intercepted by the shell before HTML5 drop events fire.
 *
 * The opener flags flip at runtime inside the Tauri thin shell, which replaces
 * the localhost routes with its own `open_in_os` command (see nativeShell.ts;
 * ruling: .agents/doc/2026-10-02-native-shell-spike.md). Everything else stays
 * OFF until its native replacement lands (T-063 children) — the code behind
 * them is kept intact.
 *
 * What intentionally still works everywhere (incl. webviews):
 *  - folder import via the legacy `<input webkitdirectory>` picker
 *  - file / URL / cloud imports (plain inputs, FileReader, fetch)
 *  - in-app node drag & drop (custom DataTransfer payload, no item access)
 */
import { isHost } from "./nativeShell";

/** True inside any desktop shell host (Tauri or Electron); false on web, SSR, and bun tests. */
const inHostShell = isHost();

export const LOCAL_FS_FEATURES = {
  /** "Open in File Explorer" (folder context menu + Alt+O): /api/open-folder or the shell's open_in_os. */
  openInOs: inHostShell,
  /** "Open File" (file context menu + Enter): /api/open-file, FS handles, or the shell's open_in_os. */
  openFileInOs: inHostShell,
  /** External OS folder drop on the empty canvas → import. */
  dragDropImport: false,
  /** Drop a disk-backed folder child onto the canvas to expand it from disk. */
  dropToExpand: false,
  /** File System Access API directory picker (showDirectoryPicker). */
  fsaDirectoryPicker: false,
} as const;

// ── Standalone shell: server-dependent features (T-098 / T-099) ─────────────
// The web app is the only host with a server — none of the /api routes ship in
// the desktop static export. Every surface below is OFF in the shell regardless
// of tier: no account exists to gate on. Replacements: local library (.fwr,
// T-101), theme files (.fwtheme, T-101), host_fetch for URL/GitHub import
// (T-102), GitHub issues for bug reports (T-105). One map decides — components
// gate on cloudFeature() instead of inventing per-surface shell checks.
export type CloudFeature =
  | "accounts"        // sign-in, profile edits, account deletion
  | "cloudSave"       // /api/graphs cloud-saved projects
  | "share"           // share dialogs, short links, invite tokens
  | "gallery"         // community galleries + theme gallery publish
  | "cloudImport"     // OneDrive/GDrive connectors + server-backed URL import
  | "watch"           // watched indexes + nightly email digests
  | "versionHistory"  // /api/graphs/[id]/versions snapshots
  | "billing";        // Stripe checkout / customer portal

/** True on the web (a server exists); false in the desktop shell. */
export const CLOUD_FEATURES: Record<CloudFeature, boolean> = {
  accounts: true,
  cloudSave: true,
  share: true,
  gallery: true,
  cloudImport: true,
  watch: true,
  versionHistory: true,
  billing: true,
};

/** Pure core: unit-testable without a DOM or a host. */
export function cloudFeatureFor(inShell: boolean, feature: CloudFeature): boolean {
  return CLOUD_FEATURES[feature] && !inShell;
}

/** Shell-aware check used by components: server features are off standalone. */
export function cloudFeature(feature: CloudFeature): boolean {
  return cloudFeatureFor(inHostShell, feature);
}
