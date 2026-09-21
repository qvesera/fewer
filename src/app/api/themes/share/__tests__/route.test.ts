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

const { POST } = await import("../route");
function req(body?: unknown) {
  return new Request("http://localhost/api/themes/share", {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("POST without supabase env -> 503", async () => {
  const orig = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try { expect((await POST(req())).status).toBe(503); } finally { process.env.NEXT_PUBLIC_SUPABASE_URL = orig; }
});

test("POST without user -> 401", async () => {
  mockGetUser.mockReturnValue({ data: { user: null } });
  const res = await POST(req());
  expect(res.status).toBe(401);
});

test("POST with user -> creates gallery entry", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue(
    { data: { id: "t1", name: "My Theme", theme: {} }, error: null },
    { data: { first_name: "Yash", username: "yash" }, error: null },
    { data: { id: "s1" }, error: null },
  );
  const res = await POST(req({ id: "t1", title: "My Theme" }));
  expect(res.status).toBe(200);
});

test("POST without id -> 400", async () => {
  mockGetUser.mockReturnValue({ data: { user: { id: "u1" } } });
  queue({ data: null, error: null });
  const res = await POST(req({ title: "No ID" }));
  expect(res.status).toBe(400);
});
