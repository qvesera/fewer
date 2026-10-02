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
import { isTauri } from "./nativeShell";

/** True inside the Tauri webview; false on web, SSR, and bun tests. */
const inTauriShell = isTauri();

export const LOCAL_FS_FEATURES = {
  /** "Open in File Explorer" (folder context menu + Alt+O): /api/open-folder or the shell's open_in_os. */
  openInOs: inTauriShell,
  /** "Open File" (file context menu + Enter): /api/open-file, FS handles, or the shell's open_in_os. */
  openFileInOs: inTauriShell,
  /** External OS folder drop on the empty canvas → import. */
  dragDropImport: false,
  /** Drop a disk-backed folder child onto the canvas to expand it from disk. */
  dropToExpand: false,
  /** File System Access API directory picker (showDirectoryPicker). */
  fsaDirectoryPicker: false,
} as const;
