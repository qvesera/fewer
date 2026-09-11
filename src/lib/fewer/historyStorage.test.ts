import { test, expect } from "bun:test";
import { saveHistoryLocal, loadHistoryLocal, clearHistoryLocal, HISTORY_STORAGE_KEY } from "./historyStorage";
import type { HistoryEntry } from "@/store/slices/types";

// ─── Test harness ─────────────────────────────────────────────
// Bun test env has no sessionStorage — stub it, same as snapshot.test.ts.

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  } as unknown as Storage;
}

if (typeof globalThis.window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}
(globalThis as Record<string, unknown>).sessionStorage = makeStorage();

function op(type = "move-positions"): HistoryEntry {
  return { ops: [{ type, moves: [] } as never], timestamp: 1 };
}

// ─── round-trip ────────────────────────────────────────────────

test("save/load round-trips past and future", () => {
  const past = [op(), op()];
  const future = [op()];
  saveHistoryLocal(past, future);
  const loaded = loadHistoryLocal();
  expect(loaded).not.toBeNull();
  expect(loaded!.past).toHaveLength(2);
  expect(loaded!.future).toHaveLength(1);
  expect(loaded!.past[0].ops).toHaveLength(1);
});

// ─── empty → removes key ──────────────────────────────────────

test("saving both empty removes the key", () => {
  saveHistoryLocal([op()], [op()]);
  expect(sessionStorage.getItem(HISTORY_STORAGE_KEY)).not.toBeNull();
  saveHistoryLocal([], []);
  expect(sessionStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  expect(loadHistoryLocal()).toBeNull();
});

// ─── corrupt / absent → null ───────────────────────────────────

test("loadHistoryLocal returns null for absent key", () => {
  clearHistoryLocal();
  expect(loadHistoryLocal()).toBeNull();
});

test("loadHistoryLocal returns null for corrupt JSON", () => {
  sessionStorage.setItem(HISTORY_STORAGE_KEY, "{bad json");
  expect(loadHistoryLocal()).toBeNull();
});

test("loadHistoryLocal returns null for wrong version", () => {
  sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 999, past: [], future: [] }));
  expect(loadHistoryLocal()).toBeNull();
});

test("loadHistoryLocal returns null when entries are malformed", () => {
  sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, past: [{ noOps: true }], future: [] }));
  expect(loadHistoryLocal()).toBeNull();
});

// ─── clear ─────────────────────────────────────────────────────

test("clearHistoryLocal removes the key", () => {
  saveHistoryLocal([op()], []);
  expect(loadHistoryLocal()).not.toBeNull();
  clearHistoryLocal();
  expect(loadHistoryLocal()).toBeNull();
});
