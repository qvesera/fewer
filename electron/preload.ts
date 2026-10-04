// Preload — the renderer side of the seam (T-095). Exposes exactly one
// function, shaped like Tauri's `__TAURI_INTERNALS__.invoke`, so
// `isElectron()`/`hostInvoke` in src/lib/fewer/nativeShell.ts route to it with
// zero feature-code changes. Runs with contextIsolation; only the whitelisted
// electron preload APIs are available.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__FEWER_NATIVE__", {
  invoke: (cmd: string, args?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke("fewer:invoke", cmd, args ?? {}),
});
