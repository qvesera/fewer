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

const { GET, POST } = await import("../route");

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/graphs", {
    method, headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("GET without user -> 401", async () => {
  mockGetUser.mockReturnValue({ data: { user: null } });
  const res = await GET();
  expect(res.status).toBe(401);
});

test("GET with user -> returns graphs", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue(
    { data: [{ id: "g1", name: "test", data: {} }], error: null },
    { data: null, error: null },
  );
  const res = await GET();
  const body = await res.json();
  expect(body.graphs).toBeDefined();
  expect(body.graphs).toHaveLength(1);
});

test("POST without user -> 401", async () => {
  mockGetUser.mockReturnValue({ data: { user: null } });
  const res = await POST(req("POST", { name: "T", data: { nodes: [] } }));
  expect(res.status).toBe(401);
});

test("POST with user and small payload -> creates", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue(
    { data: { plan: "free" }, error: null },
    { count: 0, error: null },
    { data: { id: "g-new", name: "Test" }, error: null },
    { data: null, error: null },
    { data: null, error: null },
  );
  const res = await POST(req("POST", { name: "Test", data: { nodes: [] } }));
  const body = await res.json();
  expect(body.graph).toBeDefined();
});

test("GET handles missing env -> 401", async () => {
  const orig = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try { expect((await GET()).status).toBe(401); } finally { process.env.NEXT_PUBLIC_SUPABASE_URL = orig; }
});

test("POST with dangerous text -> 400", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue(
    { data: { plan: "free" }, error: null },
    { count: 0, error: null },
  );
  const res = await POST(req("POST", { name: "[object Object]", data: { nodes: [] } }));
  expect(res.status).toBe(400);
});
