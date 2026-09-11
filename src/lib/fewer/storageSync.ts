/**
 * Cross-tab sync via the browser's `storage` event.
 *
 * The `storage` event fires in **other** tabs when a tab writes to
 * localStorage — never in the writing tab itself, so there's no feedback loop.
 * sessionStorage doesn't fire storage events, which is exactly what we want
 * (per-tab graph isolation, no sync).
 *
 * ponytail: whole-value replace on shared prefs — last-write-wins is user intent.
 */

type StorageKey = string;
type Handler = (value: string | null) => void;

const listeners = new Map<StorageKey, Handler>();

let installed = false;

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.newValue) {
      // key removed — treat as null
      listeners.get(e.key!)?.(null);
      return;
    }
    listeners.get(e.key)?.(e.newValue);
  });
}

/**
 * React to localStorage changes made in other tabs.
 * Returns an unsubscribe function.
 *
 * Usage (in a useEffect):
 * ```ts
 * const unsub = onStorageKey("fewer-theme", (val) => { ... });
 * return unsub;
 * ```
 */
export function onStorageKey(key: StorageKey, handler: Handler): () => void {
  install();
  listeners.set(key, handler);
  return () => { listeners.delete(key); };
}
