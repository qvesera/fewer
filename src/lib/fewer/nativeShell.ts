// Desktop-shell glue (T-087 POC → T-094 seam): runtime host detection + native
// IPC calls. The web app stays the source of truth; these helpers only route
// to a host bridge when one exists.
//
// SEAM CONTRACT (T-094): exactly ONE invoke surface per host, same command
// names and payload shapes on both sides:
//   Tauri     window.__TAURI_INTERNALS__.invoke   (withGlobalTauri)
//   Electron  window.__FEWER_NATIVE__.invoke      (contextBridge from preload)
// Feature code never names either host: it calls the native* helpers below and
// gates behavior on isHost(). Host packages (@tauri-apps/*, electron) are
// banned in src/ by the ESLint no-restricted-imports guard — the Rust side of
// the contract is src-tauri/src/lib.rs, the Node side is electron/handlers/.
// Historical contract: .agents/doc/2026-10-02-native-shell-spike.md (§7, §9).

/** True when running inside a Tauri webview (withGlobalTauri exposes internals). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True when running inside the Electron shell (preload exposes __FEWER_NATIVE__). */
export function isElectron(): boolean {
  return typeof window !== "undefined" && "__FEWER_NATIVE__" in window;
}

/**
 * True for any desktop shell host (Tauri or Electron). Feature code gates
 * native behavior on this — never on a specific engine.
 */
export function isHost(): boolean {
  return isTauri() || isElectron();
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostBridge {
  __TAURI_INTERNALS__?: { invoke: Invoke };
  __FEWER_NATIVE__?: { invoke: Invoke };
}

/**
 * Route one RPC to whichever host bridge is present (Electron first, then
 * Tauri). Rejects in the web app — callers that must work without a host guard
 * on isHost() first.
 */
export function hostInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const noHost = (): Promise<never> =>
    Promise.reject(new Error(`not running inside a desktop shell (no host bridge) — command "${cmd}"`));
  if (typeof window === "undefined") return noHost();
  const w = window as unknown as HostBridge;
  const bridges: Array<{ present: boolean; invoke?: Invoke; name: string }> = [
    { present: "__FEWER_NATIVE__" in w, invoke: w.__FEWER_NATIVE__?.invoke, name: "electron" },
    { present: "__TAURI_INTERNALS__" in w, invoke: w.__TAURI_INTERNALS__?.invoke, name: "tauri" },
  ];
  const host = bridges.find((b) => b.present && b.invoke);
  if (!host?.invoke) return noHost();
  return host.invoke<T>(cmd, args);
}

/** Open a file/folder with the OS default handler (replaces /api/open-*). */
export function nativeOpenPath(path: string): Promise<void> {
  return hostInvoke("open_in_os", { path });
}

/** Windowed directory listing — the spike §7.1 RPC shape. */
/** One entry of the shell's list_dir RPC; symlink carries link metadata
 *  (type already FOLLOWS the link — folder/file is the honest target kind). */
export interface NativeDirEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  symlink?: { target: string; broken: boolean };
}
export interface NativeDirPage {
  entries: NativeDirEntry[];
  total: number;
}
export function nativeListDir(path: string, offset: number, limit: number): Promise<NativeDirPage> {
  return hostInvoke("list_dir", { path, offset, limit });
}

/* ---- Local library FS (T-089): scoped text-file ops for the library dir ---- */

export function nativeFsRead(path: string): Promise<string> {
  return hostInvoke("fs_read_text", { path });
}
export function nativeFsWrite(path: string, contents: string): Promise<void> {
  return hostInvoke("fs_write_text", { path, contents });
}
export function nativeFsRemove(path: string): Promise<void> {
  return hostInvoke("fs_remove_file", { path });
}
/** Native folder picker; resolves to the chosen directory path or null. */
export function nativePickDirectory(): Promise<string | null> {
  return hostInvoke<string | null>("pick_library_dir");
}
/** Native single-file picker for license activation; null = cancelled. */
export function nativePickLicenseFile(): Promise<string | null> {
  return hostInvoke<string | null>("pick_license_file");
}
/** Ed25519 license signature check (host-side crypto). Resolves on valid, rejects otherwise. */
export function nativeVerifyLicenseSig(payload: string, sig: number[]): Promise<void> {
  return hostInvoke<void>("verify_license_sig", { payload, sig });
}
/** First-run default library dir (~/Documents/fewer), created by the host. */
export function nativeDefaultLibraryDir(): Promise<string> {
  return hostInvoke<string>("default_library_dir");
}
/** Read a file as raw bytes (preview panel). Rejects when over `maxBytes`. */
export function nativeFsReadBytes(path: string, maxBytes: number): Promise<ArrayBuffer> {
  return hostInvoke<ArrayBuffer>("fs_read_bytes", { path, maxBytes });
}

