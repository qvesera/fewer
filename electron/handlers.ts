// Electron host command handlers (T-095) — the Node side of the seam contract
// documented in src/lib/fewer/nativeShell.ts. One invoke surface
// (`window.__FEWER_NATIVE__.invoke`), the same command names and payload shapes
// as the Rust host (src-tauri/src/lib.rs): feature code cannot tell the two
// hosts apart.
//
// Deliberately NO `electron` imports in this file: everything here is pure Node
// (fs, crypto) so bun can unit-test it (electron/handlers.test.ts). Dialogs and
// `shell.openPath` are injected by electron/main.ts.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* ------------------------- injected host services ------------------------- */

export interface HostDialogs {
  /** Native folder picker; null when cancelled. */
  pickDirectory(): Promise<string | null>;
  /** Native single-file picker; null when cancelled. */
  pickFile(): Promise<string | null>;
}

export interface HostShell {
  /** Open a path with the OS default handler; rejects with the OS error. */
  openPath(p: string): Promise<void>;
}

/* -------------------------------- list_dir -------------------------------- */

export interface DirEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  symlink?: { target: string; broken: boolean };
}
export interface DirPage {
  entries: DirEntry[];
  total: number;
}

/**
 * Windowed directory listing mirroring the Rust `list_dir`: case-insensitive
 * name sort (lowercased code-unit compare, same as `to_lowercase().cmp()`),
 * symlink metadata with the honest kind FOLLOwing the link, `total` = all
 * entries, `entries` = the requested window.
 */
export async function listDir(p: string, offset: number, limit: number): Promise<DirPage> {
  const dirents = await fs.readdir(p, { withFileTypes: true });
  const entries: DirEntry[] = [];
  for (const d of dirents) {
    const full = path.join(p, d.name);
    if (d.isSymbolicLink()) {
      // lstat-style: dirent says "link"; follow for the honest kind/size.
      const target = await fs.readlink(full).then((t) => t, () => "");
      try {
        const md = await fs.stat(full);
        entries.push({
          name: d.name,
          type: md.isDirectory() ? "folder" : "file",
          size: md.isFile() ? md.size : undefined,
          symlink: { target, broken: false },
        });
      } catch {
        entries.push({ name: d.name, type: "file", size: 0, symlink: { target, broken: true } });
      }
      continue;
    }
    const isDir = d.isDirectory();
    let size: number | undefined;
    if (!isDir) {
      size = await fs.stat(full).then((md) => md.size, () => 0);
    }
    entries.push({ name: d.name, type: isDir ? "folder" : "file", size, symlink: undefined });
  }
  entries.sort((a, b) => {
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  });
  return { entries: entries.slice(offset, offset + limit), total: entries.length };
}

/* ------------------------------- fs scoped -------------------------------- */

/** Read a file as raw bytes; rejects when over `maxBytes` (preview cap). */
export async function fsReadBytes(p: string, maxBytes: number): Promise<ArrayBuffer> {
  const md = await fs.stat(p);
  if (md.size > maxBytes) {
    throw new Error(`file too large: ${md.size} bytes > cap ${maxBytes}`);
  }
  const buf = await fs.readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/* ---------------------------- license verify ------------------------------ */

// Pinned dev public key — MUST stay in sync with LICENSE_PUBLIC_KEY_HEX in
// src-tauri/src/lib.rs (same signing key, scripts/sign-license.ts). The key
// lives outside the repo; only this public constant is committed.
export const LICENSE_PUBLIC_KEY_HEX =
  "c9b138300462d3c778916de3e0ad7680f656f90564cf7e328361535dc894f9b2";

// Ed25519 SPKI DER prefix (RFC 8410) + the 32 raw key bytes.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Verify an Ed25519 license signature over the exact payload bytes (no
 * canonicalization — mirrors verify_license_sig in src-tauri/src/lib.rs).
 * Resolves on valid; throws otherwise.
 */
export function verifyLicenseSig(payload: string, sig: Uint8Array): void {
  if (sig.length !== 64) throw new Error("bad signature length");
  const key = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(LICENSE_PUBLIC_KEY_HEX, "hex")]),
    format: "der",
    type: "spki",
  });
  const ok = crypto.verify(null, Buffer.from(payload, "utf8"), key, Buffer.from(sig));
  if (!ok) throw new Error("license signature verification failed");
}

/* -------------------------------- handlers -------------------------------- */

/** The command surface. Names + shapes are the seam contract. */
export function createHostHandlers(deps: { dialogs: HostDialogs; shell: HostShell }) {
  return {
    async open_in_os({ path: p }: { path: string }): Promise<void> {
      await deps.shell.openPath(p);
    },
    async list_dir({ path: p, offset, limit }: { path: string; offset: number; limit: number }) {
      return listDir(p, offset, limit);
    },
    async fs_read_text({ path: p }: { path: string }): Promise<string> {
      return fs.readFile(p, "utf8");
    },
    async fs_write_text({ path: p, contents }: { path: string; contents: string }): Promise<void> {
      await fs.writeFile(p, contents, "utf8");
    },
    async fs_remove_file({ path: p }: { path: string }): Promise<void> {
      await fs.rm(p);
    },
    async fs_read_bytes({ path: p, maxBytes }: { path: string; maxBytes: number }) {
      return fsReadBytes(p, maxBytes);
    },
    pick_library_dir(): Promise<string | null> {
      return deps.dialogs.pickDirectory();
    },
    pick_license_file(): Promise<string | null> {
      return deps.dialogs.pickFile();
    },
    async verify_license_sig({ payload, sig }: { payload: string; sig: number[] }): Promise<void> {
      verifyLicenseSig(payload, Uint8Array.from(sig));
    },
  };
}

export type HostHandlers = ReturnType<typeof createHostHandlers>;
export type HostCommand = keyof HostHandlers;

/** Dispatch table for ipcMain.handle — unknown commands reject, like Tauri. */
export function createDispatch(deps: { dialogs: HostDialogs; shell: HostShell }) {
  const handlers = createHostHandlers(deps) as Record<string, (args: never) => Promise<unknown>>;
  return async function dispatch(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const fn = handlers[cmd];
    if (!fn) throw new Error(`unknown command: ${cmd}`);
    return fn(args as never);
  };
}
