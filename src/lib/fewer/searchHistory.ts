/** sessionStorage key for the persisted search-history list. */
export const SEARCH_HISTORY_KEY = "fewer-search-history";

/** Maximum number of recent-search entries retained. */
export const MAX_SEARCH_HISTORY = 12;

/**
 * Prepend `q` to `prev`, removing any existing duplicate, capped at
 * {@link MAX_SEARCH_HISTORY}. Returns `prev` unchanged when `q` is blank.
 *
 * ponytail: pure for testability — the store slice wires sessionStorage I/O.
 */
export function withSearchEntry(prev: string[], q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return prev;
  return [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_SEARCH_HISTORY);
}
