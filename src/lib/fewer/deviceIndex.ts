import { isHost, nativeIndexBuild, nativeIndexSearch, type NativeDeviceHit } from "./nativeShell";
import type { FewerNode } from "./types";

/**
 * On-device search helpers (T-200). The index itself lives in the Electron
 * main process (node:sqlite); these are the renderer-side seams: availability,
 * a quiet auto-index after a folder opens, the debounced search, and the
 * absolute-hit → graph-node mapping used by the search panel.
 */

/** Minimum query length before the device index is consulted. */
export const DEVICE_SEARCH_MIN_QUERY = 2;
/** Max device hits rendered under the canvas results. */
export const DEVICE_SEARCH_LIMIT = 25;

export function deviceSearchAvailable(): boolean {
  return isHost();
}

/** Re-index a folder root, best-effort: a failed index never breaks a flow. */
export async function indexFolderQuiet(root: string): Promise<void> {
  if (!isHost() || !root) return;
  try {
    await nativeIndexBuild(root);
  } catch {
    // Index is a convenience — swallow and move on.
  }
}

/** Query the device index; empty list when unavailable, too short, or failed. */
export async function searchDevice(query: string): Promise<NativeDeviceHit[]> {
  if (!isHost() || query.trim().length < DEVICE_SEARCH_MIN_QUERY) return [];
  try {
    return (await nativeIndexSearch(query, DEVICE_SEARCH_LIMIT)).hits;
  } catch {
    return [];
  }
}

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Absolute hit path → path relative to the graph root (null when outside). */
export function deviceRelativePath(hit: { path: string }, root: string | null): string | null {
  if (!root) return null;
  const h = norm(hit.path);
  const r = norm(root).replace(/\/+$/, "");
  return h.startsWith(r + "/") ? h.slice(r.length + 1) : null;
}

/** The graph node a device hit points at, when the root is loaded. */
export function findDeviceNode(
  nodes: FewerNode[],
  hit: { path: string },
  root: string | null,
): FewerNode | undefined {
  const rel = deviceRelativePath(hit, root);
  if (!rel) return undefined;
  return nodes.find((n) => norm(n.data.path ?? "") === rel);
}