// Tauri thin-shell glue (POC, T-087): runtime detection + native IPC calls.
// The web app stays the source of truth; these helpers only route to the
// shell's commands when one exists. Contract:
// .agents/doc/2026-10-02-native-shell-spike.md (§7 flag map, §9 POC).

/** True when running inside a Tauri webview (withGlobalTauri exposes internals). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } })
    .__TAURI_INTERNALS__;
  if (!internals?.invoke) return Promise.reject(new Error("not running inside tauri"));
  return internals.invoke<T>(cmd, args);
}

/** Open a file/folder with the OS default handler (replaces /api/open-*). */
export function nativeOpenPath(path: string): Promise<void> {
  return tauriInvoke("open_in_os", { path });
}

/** Windowed directory listing — the spike §7.1 RPC shape. */
export interface NativeDirEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
}
export interface NativeDirPage {
  entries: NativeDirEntry[];
  total: number;
}
export function nativeListDir(path: string, offset: number, limit: number): Promise<NativeDirPage> {
  return tauriInvoke("list_dir", { path, offset, limit });
}

/* ---- Local library FS (T-089): scoped text-file ops for the library dir ---- */

export function nativeFsRead(path: string): Promise<string> {
  return tauriInvoke("fs_read_text", { path });
}
export function nativeFsWrite(path: string, contents: string): Promise<void> {
  return tauriInvoke("fs_write_text", { path, contents });
}
export function nativeFsRemove(path: string): Promise<void> {
  return tauriInvoke("fs_remove_file", { path });
}
/** Native folder picker; resolves to the chosen directory path or null. */
export function nativePickDirectory(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_library_dir");
}
/** Native single-file picker for license activation; null = cancelled. */
export function nativePickLicenseFile(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_license_file");
}
/** Ed25519 license signature check (Rust). Resolves on valid, rejects otherwise. */
export function nativeVerifyLicenseSig(payload: string, sig: number[]): Promise<void> {
  return tauriInvoke<void>("verify_license_sig", { payload, sig });
}
