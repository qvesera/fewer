import { describe, expect, test, mock } from "bun:test";
mock.module("server-only", () => ({}));

const mockUser = { id: "u1", email: "a@b.com" };
const mockGetAuthed = mock((): any => ({ supabase: {}, user: mockUser }));

// Spread the real module so getSupabaseCookieClient stays available for
// other test files in the same bun process (route.test.ts needs it).
// ponytail: never stub ./tokenExpiry here — bun's mock.module registry is
// process-wide, so a whole-module replacement made every later file see
// `() => false` and flipped the two `toBe(true)` assertions in
// tokenExpiry.test.ts depending on file order. The real one-liner is
// exercised directly below instead.
const _actual = await import("../supabaseServer");
mock.module("../supabaseServer", () => ({ ..._actual, getAuthedSupabase: mockGetAuthed }));
mock.module("./crypto", () => ({
  decryptToken: (s: string) => `decrypted:${s}`,
  encryptToken: (s: string) => `encrypted:${s}`,
}));
const mockRefreshToken = mock(async () => ({ accessToken: "new-token", expiresIn: 3600 }));
// Spread the real registry — the same rule as ../supabaseServer above, and
// the same class of bug: a whole-module replacement here leaks into
// cloud/registry.test.ts whenever bun's file order runs this file first (the
// order is not stable — CI flips it between runs), and that suite then sees a
// module with only `getAdapter`: `isProviderImplemented` is undefined and
// getAdapter hands back this stub, so 10 assertions fail. Only refreshToken is
// overridden, and only for providers that really have an adapter, so the
// unknown-provider stub (buildAuthUrl throws / refreshToken → null) survives.
const _registry = await import("./registry");
const _realGetAdapter = _registry.getAdapter;
mock.module("./registry", () => ({
  ..._registry,
  getAdapter: async (provider: any) => {
    const real = await _realGetAdapter(provider);
    return _registry.isProviderImplemented(provider) ? { ...real, refreshToken: mockRefreshToken } : real;
  },
}));

const { getAuthedClient, getConnectionWithToken } = await import("./server");

describe("getAuthedClient", () => {
  test("delegates to getAuthedSupabase", async () => {
    const result = await getAuthedClient();
    expect(result as any).toEqual({ supabase: {}, user: mockUser });
  });
  test("returns null when not signed in", async () => {
    mockGetAuthed.mockReturnValueOnce(null);
    expect(await getAuthedClient()).toBeNull();
  });
});

// ── Fake Supabase client for getConnectionWithToken ─────────────────────────

let queryResult: any = null;
function fakeSupabase() {
  return {
    auth: { getUser: mock(() => ({ data: { user: mockUser } })) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => queryResult,
            }),
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as any;
}

describe("getConnectionWithToken", () => {
  test("returns connection + decrypted token without refreshing", async () => {
    mockRefreshToken.mockClear();
    mockGetAuthed.mockReturnValueOnce({ supabase: fakeSupabase(), user: mockUser });
    // expires_at: null → isTokenExpiringSoon(null) === false → no refresh
    queryResult = { data: { id: "c1", provider: "github", user_id: "u1", access_token_enc: "tok", refresh_token_enc: null, expires_at: null }, error: null };
    const r = await getConnectionWithToken("c1", "github");
    expect(r.accessToken).toBe("decrypted:tok");
    expect(r.connection.id).toBe("c1");
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });
  test("refreshes through the real isTokenExpiringSoon when the token already expired", async () => {
    mockRefreshToken.mockClear();
    mockGetAuthed.mockReturnValueOnce({ supabase: fakeSupabase(), user: mockUser });
    queryResult = {
      data: { id: "c1", provider: "github", user_id: "u1", access_token_enc: "tok", refresh_token_enc: "refresh-tok", expires_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    };
    const r = await getConnectionWithToken("c1", "github");
    // The adapter's raw token (no decrypt step) is returned on refresh
    expect(r.accessToken).toBe("new-token");
    expect(mockRefreshToken).toHaveBeenCalledWith("decrypted:refresh-tok");
  });
  test("throws when not signed in", async () => {
    mockGetAuthed.mockReturnValueOnce(null);
    await expect(getConnectionWithToken("c1", "github")).rejects.toThrow("Not signed in");
  });
  test("throws when connection not found", async () => {
    mockGetAuthed.mockReturnValueOnce({ supabase: fakeSupabase(), user: mockUser });
    queryResult = { data: null, error: { message: "not found" } };
    await expect(getConnectionWithToken("c1", "github")).rejects.toThrow("Connection not found");
  });
});