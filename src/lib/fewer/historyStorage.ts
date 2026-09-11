import type { HistoryEntry } from "@/store/slices/types";

/**
 * sessionStorage persistence for the undo/redo history stacks (`past`/`future`).
 * The graph itself is cached separately under `fewer-graph` (see snapshot.ts);
 * this keeps the op history alongside it so a reload restores undo/redo.
 * Per-tab isolation — same rationale as the graph cache.
 */

/** sessionStorage key for the persisted undo/redo history. */
export const HISTORY_STORAGE_KEY = "fewer-history";

const HISTORY_VERSION = 1;

interface LocalHistory {
  version: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

function isValidEntries(v: unknown): v is HistoryEntry[] {
  return (
    Array.isArray(v) &&
    v.every((e) => e !== null && typeof e === "object" && Array.isArray((e as HistoryEntry).ops))
  );
}

/** Cache the undo/redo stacks so a reload restores history. Both empty → key removed. */
export function saveHistoryLocal(past: HistoryEntry[], future: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    if (past.length === 0 && future.length === 0) {
      sessionStorage.removeItem(HISTORY_STORAGE_KEY);
      return;
    }
    const payload: LocalHistory = { version: HISTORY_VERSION, past, future };
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota/failure — just skip caching; never break the app */
  }
}

/** Load the cached undo/redo stacks, if any. Returns null when absent/corrupt. */
export function loadHistoryLocal(): { past: HistoryEntry[]; future: HistoryEntry[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalHistory;
    if (parsed.version !== HISTORY_VERSION || !isValidEntries(parsed.past) || !isValidEntries(parsed.future)) {
      return null;
    }
    return { past: parsed.past, future: parsed.future };
  } catch {
    return null;
  }
}

/** Drop the cached history (stale graph, clear canvas, corrupt cache). */
export function clearHistoryLocal(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
