// Preload — the renderer side of the seam (T-095). Exposes one function,
// shaped like Tauri's `__TAURI_INTERNALS__.invoke`, so
// `isElectron()`/`hostInvoke` in src/lib/fewer/nativeShell.ts route to it with
// zero feature-code changes. Runs with contextIsolation; only the whitelisted
// electron preload APIs are available.
//
// `filePath` is the one exception to the single-invoke rule: an OS-dropped
// `File` cannot be sent over IPC (structured clone has no File path), so the
// path must be read here with `webUtils.getPathForFile`. Feature code still
// goes through `hostFilePathForDrop()` in nativeShell.ts and never names
// Electron; a host without the helper returns "" (see HostBridge).

import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("__FEWER_NATIVE__", {
  invoke: (cmd: string, args?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke("fewer:invoke", cmd, args ?? {}),
  filePath: (file: unknown): string => {
    try {
      return webUtils.getPathForFile(file as File) ?? "";
    } catch {
      return "";
    }
  },
});
