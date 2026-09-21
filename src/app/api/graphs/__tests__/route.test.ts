import { mock, test, expect } from "bun:test";

const mockGetUser: any = mock(() => ({ data: { user: { id: "u1", email: "a@b.com" } } }));

// Per-call results for the Supabase chain — each from() call pops the next.
let pendingResults: any[] = [];
function queueResults(...results: any[]) { pendingResults = [...results]; }

function makeChain(terminalResult: any = { data: [], error: null }) {
  return {
    eq: () => makeChain(terminalResult), neq: () => makeChain(terminalResult),
    not: () => makeChain(terminalResult), gte: () => makeChain(terminalResult),
    lte: () => makeChain(terminalResult), in: () => makeChain(terminalResult),
    order: () => makeChain(terminalResult), limit: () => makeChain(terminalResult),
    select: () => makeChain(terminalResult),
    insert: () => makeChain(terminalResult),
    update: () => makeChain(terminalResult),
    upsert: () => makeChain(terminalResult),
    delete: () => makeChain(terminalResult),
    count: async () => ({ count: 0, error: null }),
    maybeSingle: () => terminalResult, single: () => terminalResult,
    then(resolve: any) { resolve(terminalResult); },
  };
}

let fromCallCount = 0;
const mockFrom = mock((table: string) => {
  fromCallCount++;
  const result = pendingResults.shift() ?? { data: [], error: null };
  return makeChain(result);
});

mock.module("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));
mock.module("next/headers", () => ({
  cookies: mock(() => ({ getAll: () => [], setAll: () => {}, set: () => {}, get: () => ({ value: "" }) })),
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
  queueResults(
    { data: [{ id: "g1", name: "test", data: {} }], error: null }, // SELECT saved_graphs
    { data: null, error: null },                                       // SELECT shared_graphs
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
  queueResults(
    { data: { plan: "free" }, error: null },        // getUserPlan → profiles
    { count: 0, error: null },                       // countOwned → saved_graphs
    { data: { id: "g-new", name: "Test" }, error: null }, // insert → saved_graphs
    { data: null, error: null },                       // snapshotHistory queries
    { data: null, error: null },                       // snapshotHistory queries
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
  queueResults(
    { data: { plan: "free" }, error: null },
    { count: 0, error: null },
  );
  const res = await POST(req("POST", { name: "[object Object]", data: { nodes: [] } }));
  expect(res.status).toBe(400);
});
