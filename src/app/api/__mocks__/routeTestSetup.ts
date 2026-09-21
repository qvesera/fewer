/**
 * Shared mock setup for API route tests.
 * Call this ONCE at the top of each route test file (via import side-effect)
 * so all route tests share the same mockGetUser, mockFrom, and pendingResults.
 */
import { mock } from "bun:test";

export const mockGetUser: any = mock(() => ({ data: { user: { id: "u1", email: "a@b.com" } } }));

let pendingResults: any[] = [];
export function queue(...r: any[]) { pendingResults = [...r]; }

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

export { mockClient };

// Ensure the env check inside getSupabaseCookieClient doesn't bail in CI.
// The real function returns null when the env is missing; the mock always
// returns the mock client so route tests run regardless of CI env.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

mock.module("@/lib/fewer/supabaseServer", () => ({
  getSupabaseCookieClient: async () => mockClient,
}));
