import { test, expect } from "bun:test";
import { graphDataEqual, retentionCutoffIso, recordVersion, MAX_VERSIONS_PER_GRAPH } from "./versions";

test("graphDataEqual ignores object key order (jsonb normalizes it)", () => {
  const a = { nodes: [{ id: "n1", data: { label: "x" } }], direction: "TB", showFiles: true };
  const b = { showFiles: true, direction: "TB", nodes: [{ data: { label: "x" }, id: "n1" }] };
  expect(graphDataEqual(a, b)).toBe(true);
});

test("graphDataEqual distinguishes different values", () => {
  expect(graphDataEqual({ a: 1 }, { a: 2 })).toBe(false);
  expect(graphDataEqual(null, { a: 1 })).toBe(false);
  expect(graphDataEqual(undefined, undefined)).toBe(true);
});

test("graphDataEqual array order matters (node order is significant)", () => {
  const a = [{ id: "a" }, { id: "b" }];
  const b = [{ id: "b" }, { id: "a" }];
  expect(graphDataEqual(a, b)).toBe(false);
  expect(graphDataEqual(a, [...a])).toBe(true);
});

test("graphDataEqual catches missing/extra keys", () => {
  expect(graphDataEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  expect(graphDataEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});
test("retentionCutoffIso lands exactly `days` in the past", () => {
  const cutoff = new Date(retentionCutoffIso(30)).getTime();
  const now = Date.now();
  // Allow a couple seconds of slack for the two Date.now() calls.
  expect(now - cutoff).toBeGreaterThanOrEqual(30 * 86_400_000 - 5_000);
  expect(now - cutoff).toBeLessThan(30 * 86_400_000 + 5_000);
});

// ── recordVersion / pruneVersions ──────────────────────────────────────────
// Fake Supabase: one chainable builder serves both query shapes the code uses
// (fetchLatestRow ends in maybeSingle(); pruneVersions awaits .order() itself).
// Deliberately no mock.module — bun's registry is process-wide and this suite
// must not shadow anything for other files.

type VersionRow = { id: string; created_at: string; data?: unknown };

function fakeSupabase(rows: VersionRow[], opts: { insertError?: string } = {}) {
  const state = {
    inserted: [] as Record<string, unknown>[],
    deletedIds: null as string[] | null,
  };
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    delete: () => builder,
    in: (_column: string, ids: string[]) => {
      state.deletedIds = ids;
      return builder;
    },
    insert: async (row: Record<string, unknown>) => {
      state.inserted.push(row);
      return { error: opts.insertError ? { message: opts.insertError } : null };
    },
    maybeSingle: async () => ({ data: rows[0] ?? null }),
    then: (resolve: (v: { data: VersionRow[] }) => void) => resolve({ data: rows }),
  };
  return { supabase: { from: () => builder } as unknown as any, state };
}

const nowIso = () => new Date().toISOString();
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

test("recordVersion skips when the latest snapshot is deep-equal (jsonb key order)", async () => {
  const payload = { showFiles: true, nodes: [] as unknown[] };
  const { supabase, state } = fakeSupabase([
    { id: "v1", created_at: nowIso(), data: { nodes: [], showFiles: true } },
  ]);
  const res = await recordVersion(supabase, "u1", "g1", payload, 30);
  expect(res).toEqual({ recorded: false });
  expect(state.inserted).toHaveLength(0);
  expect(state.deletedIds).toBeNull(); // dedup must not reach the prune pass
});

test("recordVersion inserts node_count from data.nodes and prunes nothing when fresh", async () => {
  const { supabase, state } = fakeSupabase([]);
  const data = { nodes: [{ id: "a" }, { id: "b" }] };
  const res = await recordVersion(supabase, "u1", "g1", data, 30);
  expect(res).toEqual({ recorded: true });
  expect(state.inserted).toHaveLength(1);
  expect(state.inserted[0]).toMatchObject({
    saved_graph_id: "g1",
    user_id: "u1",
    node_count: 2,
    data,
  });
  expect(state.deletedIds).toBeNull();
});

test("recordVersion surfaces insert errors and skips the prune", async () => {
  const { supabase, state } = fakeSupabase([], { insertError: "boom" });
  const res = await recordVersion(supabase, "u1", "g1", { nodes: [] }, 30);
  expect(res.recorded).toBe(false);
  expect(res.error).toBe("boom");
  expect(state.deletedIds).toBeNull();
});

test("recordVersion counts 0 when the payload carries no nodes array", async () => {
  for (const data of [{ something: true }, null, "not-an-object"]) {
    const { supabase, state } = fakeSupabase([]);
    const res = await recordVersion(supabase, "u1", "g1", data, 30);
    expect(res.recorded).toBe(true);
    expect(state.inserted[0]?.node_count).toBe(0);
  }
});

test("pruneVersions drops snapshots older than the retention window", async () => {
  const rows: VersionRow[] = [
    { id: "newest", created_at: nowIso(), data: { v: 1 } },
    { id: "mid", created_at: daysAgoIso(5), data: { v: 2 } },
    { id: "ancient", created_at: daysAgoIso(40), data: { v: 3 } },
  ];
  const { supabase, state } = fakeSupabase(rows);
  const res = await recordVersion(supabase, "u1", "g1", { v: 99 }, 30);
  expect(res.recorded).toBe(true);
  expect(state.deletedIds).toEqual(["ancient"]);
});

test("pruneVersions keeps at most MAX_VERSIONS_PER_GRAPH snapshots", async () => {
  const rows: VersionRow[] = Array.from({ length: MAX_VERSIONS_PER_GRAPH + 5 }, (_, i) => ({
    id: `v${i}`,
    created_at: nowIso(),
    data: { v: i },
  }));
  const { supabase, state } = fakeSupabase(rows);
  const res = await recordVersion(supabase, "u1", "g1", { v: "fresh" }, 365);
  expect(res.recorded).toBe(true);
  // Everything past the window (index >= 50) goes; the rest stays.
  expect(state.deletedIds).toEqual(["v50", "v51", "v52", "v53", "v54"]);
});

