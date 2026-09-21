import { describe, expect, test, mock } from "bun:test";
mock.module("server-only", () => ({}));

const mockUser = { id: "u1", email: "a@b.com" };
const mockGetAuthed = mock((): any => ({ supabase: {}, user: mockUser }));
mock.module("../supabaseServer", () => ({ getAuthedSupabase: mockGetAuthed }));
mock.module("./crypto", () => ({
  decryptToken: (s: string) => `decrypted:${s}`,
  encryptToken: (s: string) => `encrypted:${s}`,
}));
mock.module("./tokenExpiry", () => ({ isTokenExpiringSoon: mock(() => false) }));
const mockRefreshToken = mock(async () => ({ accessToken: "new-token", expiresIn: 3600 }));
mock.module("./registry", () => ({
  getAdapter: async () => ({ refreshToken: mockRefreshToken }),
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
  test("returns connection + decrypted token", async () => {
    mockGetAuthed.mockReturnValueOnce({ supabase: fakeSupabase(), user: mockUser });
    queryResult = { data: { id: "c1", provider: "github", user_id: "u1", access_token_enc: "tok", refresh_token_enc: null, expires_at: null }, error: null };
    const r = await getConnectionWithToken("c1", "github");
    expect(r.accessToken).toBe("decrypted:tok");
    expect(r.connection.id).toBe("c1");
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