// Host fetch seam (T-102). In the desktop shell the renderer's fetch is
// CORS-bound to the app:// origin, so cross-origin imports (public file
// indexes, the GitHub API) fail — the main process has no CORS. The bridge:
// FewerApp registers a host-backed fetcher at boot; netFetch() routes through
// it when registered, otherwise falls through to the browser fetch (web).
//
// Deliberately imports nothing — crawl.ts and the import hook sit in the
// fragile ImportFlowDialog mock graph, so this module stays dependency-free
// (same lesson as features.ts: thread, don't import the host layer here).
export type HostFetchFn = (url: string) => Promise<Response>;

let hostFetchFn: HostFetchFn | null = null;

/** Register the host-backed fetcher (shell boot). Pass null to reset (tests). */
export function registerHostFetch(fn: HostFetchFn | null): void {
  hostFetchFn = fn;
}

/** True when a host fetcher is registered (shell). */
export function netFetchIsHostBacked(): boolean {
  return hostFetchFn !== null;
}

/**
 * Fetch a URL, through the host bridge when registered. The bridge ignores
 * `init` (the main process owns timeout/redirect/UA); web passes it through.
 */
export async function netFetch(url: string, init?: RequestInit): Promise<Response> {
  if (hostFetchFn) return hostFetchFn(url);
  return fetch(url, init);
}
