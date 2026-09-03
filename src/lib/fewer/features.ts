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
 * Everything is switched OFF. When a Tauri (or similar) branch replaces these
 * paths with native commands, flip the flags there — the code behind them is
 * kept intact.
 *
 * What intentionally still works everywhere (incl. webviews):
 *  - folder import via the legacy `<input webkitdirectory>` picker
 *  - file / URL / cloud imports (plain inputs, FileReader, fetch)
 *  - in-app node drag & drop (custom DataTransfer payload, no item access)
 */
export const LOCAL_FS_FEATURES = {
  /** "Open in File Explorer" (folder context menu + Alt+O) via /api/open-folder. */
  openInOs: false,
  /** "Open File" (file context menu + Enter) via /api/open-file or FS handles. */
  openFileInOs: false,
  /** External OS folder drop on the empty canvas → import. */
  dragDropImport: false,
  /** Drop a disk-backed folder child onto the canvas to expand it from disk. */
  dropToExpand: false,
  /** File System Access API directory picker (showDirectoryPicker). */
  fsaDirectoryPicker: false,
} as const;
