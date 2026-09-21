import { mock, test, expect } from "bun:test";

const mockGetUser: any = mock(() => ({ data: { user: { id: "u1", email: "a@b.com" } } }));
let pendingResults: any[] = [];
function queue(...r: any[]) { pendingResults = [...r]; }
function chain(t: any = { data: [], error: null }) {
  return {
    eq: () => chain(t), neq: () => chain(t), not: () => chain(t),
    gte: () => chain(t), lte: () => chain(t), in: () => chain(t),
    order: () => chain(t), limit: () => chain(t),
    select: () => chain(t), insert: () => chain(t), update: () => chain(t),
    upsert: () => chain(t), delete: () => chain(t),
    count: async () => ({ count: 0, error: null }),
    maybeSingle: () => t, single: () => t, then(r: any) { r(t); },
  };
}
const mockFrom = mock(() => { const r = pendingResults.shift() ?? { data: [], error: null }; return chain(r); });
const mockClient = { auth: { getUser: mockGetUser }, from: mockFrom };

mock.module("@/lib/fewer/supabaseServer", () => ({
  getSupabaseCookieClient: async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    return mockClient;
  },
}));
mock.module("@/lib/fewer/plans", () => ({
  getUserPlan: async () => "free",
  limitsFor: () => ({ savedGraphs: 100, savedThemes: true, largeShareLinks: true, inviteSharing: true, watchedIndexes: 3, historyDays: 365, cloudConnections: 5 }),
  overLimit: () => false,
}));

const { POST, GET } = await import("../route");

function post(body?: unknown) {
  return new Request("http://localhost/api/share", {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function get(savedGraphId?: string) {
  const url = savedGraphId
    ? `http://localhost/api/share?saved_graph_id=${savedGraphId}`
    : "http://localhost/api/share";
  return new Request(url, { method: "GET" });
}

test("POST without data -> 400", async () => {
  const res = await POST(post({ access: "public" }));
  expect(res.status).toBe(400);
});

test("POST without user -> 403", async () => {
  mockGetUser.mockReturnValue({ data: { user: null } });
  const res = await POST(post({ data: { nodes: [] }, access: "public" }));
  expect(res.status).toBe(403);
});

test("POST with dangerous gallery title -> 400", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  const res = await POST(post({ data: { nodes: [] }, access: "public", gallery_title: "[object Object]" }));
  expect(res.status).toBe(400);
});

test("GET without saved_graph_id -> 400", async () => {
  const res = await GET(get());
  expect(res.status).toBe(400);
});

test("GET without user -> 401", async () => {
  mockGetUser.mockReturnValue({ data: { user: null } });
  const res = await GET(get("s1"));
  expect(res.status).toBe(401);
});

test("GET with user and no share -> 404", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue({ data: null, error: null });
  const res = await GET(get("s1"));
  expect(res.status).toBe(404);
});

test("GET with user and existing share -> 200", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue({ data: { id: "s1", access: "public" }, error: null });
  const res = await GET(get("s1"));
  const body = await res.json();
  expect(body.share).toBeDefined();
});
