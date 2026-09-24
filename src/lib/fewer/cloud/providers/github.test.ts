/**
 * Characterization tests for github.ts cloud provider adapter.
 *
 * Why one file? bun mock.module is process-global but module instances are
 * per-file. This file mocks server-only, oauth, and fetch so github.ts
 * can be imported and tested in a bun test environment.
 */
import { mock, test, expect, describe, beforeEach, afterEach } from "bun:test";

// -- Mocks for server-only and oauth --
mock.module("server-only", () => ({}));
mock.module("../oauth", () => ({
  callbackUrl: () => "http://localhost:3000/api/cloud/callback/github",
}));

// -- Mock fetch --
const originalFetch = globalThis.fetch;
const fetchCalls: Array<{ url: string; init?: any }> = [];
function mockFetch(handler: (url: string, init?: any) => any) {
  const fn = async (url: any, init?: any) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    fetchCalls.push({ url: urlStr, init });
    const r = handler(urlStr, init);
    if (r instanceof Response) return r;
    // Build a Response that respects { ok, status, body } from plain objects
    const status = r.status ?? 200;
    const ok = status >= 200 && status < 300;
    const body = JSON.stringify(r.body ?? r);
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  };
  (globalThis as Record<string, unknown>).fetch = fn;
}

// -- Import adapter AFTER mocks --
const { githubAdapter } = await import("../providers/github");

beforeEach(() => {
  fetchCalls.length = 0;
  process.env.GITHUB_CLIENT_ID = "test-id";
  process.env.GITHUB_CLIENT_SECRET = "test-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
});

// ── buildAuthUrl ─────────────────────────────────────────────────────
describe("buildAuthUrl", () => {
  test("throws when env vars are missing", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    await expect(githubAdapter.buildAuthUrl("test-state")).rejects.toThrow("not configured");
  });

  test("returns a valid GitHub OAuth URL", async () => {
    const url = await githubAdapter.buildAuthUrl("my-state");
    expect(url).toContain("github.com/login/oauth/authorize");
    expect(url).toContain("client_id=test-id");
    expect(url).toContain("scope=repo");
    expect(url).toContain("state=my-state");
  });
});

// ── exchangeCode ─────────────────────────────────────────────────────
describe("exchangeCode", () => {
  test("throws on token exchange failure", async () => {
    mockFetch(() => ({ status: 400, body: {} }));
    await expect(githubAdapter.exchangeCode("bad-code")).rejects.toThrow();
  });

  test("throws on error in response body", async () => {
    mockFetch(() => ({ status: 200, body: { error: "bad_code" } }));
    await expect(githubAdapter.exchangeCode("bad-code")).rejects.toThrow("bad_code");
  });

  test("returns user info on success", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        // token exchange
        return { access_token: "gh-token-123" };
      }
      // /user call
      return { login: "octocat", name: "The Octocat" };
    });

    const result = await githubAdapter.exchangeCode("valid-code");
    expect(result.accessToken).toBe("gh-token-123");
    expect(result.accountId).toBe("octocat");
    expect(result.accountName).toBe("octocat");
  });
});

// ── refreshToken ─────────────────────────────────────────────────────
describe("refreshToken", () => {
  test("returns null (GitHub tokens don't expire)", async () => {
    const result = await githubAdapter.refreshToken("any-token");
    expect(result).toBeNull();
  });
});

// ── listChildren ─────────────────────────────────────────────────────
describe("listChildren", () => {
  test("root (no ref) -> lists repos", async () => {
    mockFetch(() => [
      { full_name: "user/repo1", html_url: "https://github.com/user/repo1", private: false },
      { full_name: "user/repo2", html_url: "https://github.com/user/repo2", private: true },
    ]);

    const result = await githubAdapter.listChildren("token", "");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("user/repo1");
    expect(result.entries[0].type).toBe("folder");
    expect(result.entries[0].webUrl).toContain("github.com/user/repo1");
  });

  test("repo root -> lists tree items", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) {
        // refs/heads/main
        return { object: { sha: "abc123" } };
      }
      // git/trees
      return {
        tree: [
          { path: "src", type: "tree" },
          { path: "src/index.ts", type: "blob", size: 100 },
          { path: "README.md", type: "blob", size: 50 },
        ],
      };
    });

    const result = await githubAdapter.listChildren("token", "user/repo");
    expect(result.entries).toBeDefined();
    // root folder contains: src (folder), README.md (file)
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
  });

  test("repo + subpath -> resolves branch from path", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount <= 2) {
        // two ref lookups for resolveBranchPath
        if (callCount === 1) {
          // main fails
          return { status: 404, body: {} };
        }
        // develop branch found
        return { object: { sha: "def456" } };
      }
      // tree
      return { tree: [{ path: "lib/util.ts", type: "blob", size: 200 }] };
    });

    const result = await githubAdapter.listChildren("token", "user/repo/develop/lib");
    expect(result.entries).toBeDefined();
  });
});

// ── buildTree ────────────────────────────────────────────────────────
describe("buildTree", () => {
  test("builds nested structure from flat tree", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) return { default_branch: "main" }; // /repos/owner/repo
      if (callCount === 2) return { object: { sha: "abc" } };  // refs/heads/main
      return {  // git/trees
        tree: [
          { path: "src", type: "tree" },
          { path: "src/utils", type: "tree" },
          { path: "src/utils/helper.ts", type: "blob", size: 300 },
          { path: "src/index.ts", type: "blob", size: 100 },
          { path: "package.json", type: "blob", size: 50 },
        ],
      };
    });

    const tree = await githubAdapter.buildTree!("token", "user/repo", 0);
    expect(tree.name).toBeDefined();
    expect(tree.type).toBe("folder");
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBeGreaterThanOrEqual(1);
  });

  test("respects depth limit", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) return { default_branch: "main" };
      if (callCount === 2) return { object: { sha: "abc" } };
      return {
        tree: [
          { path: "a/b/c/d/deep.ts", type: "blob", size: 10 },
          { path: "shallow.ts", type: "blob", size: 10 },
        ],
      };
    });

    const tree = await githubAdapter.buildTree!("token", "user/repo", 2);
    // depth=2 should include a/b/c/d (4 levels > 2, so excluded)
    // but shallow.ts should be included
    const flat = flattenTree(tree);
    expect(flat.some((n) => n === "shallow.ts")).toBe(true);
  });

  test("applies rootPath scoping via ref", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) return { default_branch: "main" };
      if (callCount === 2) return { object: { sha: "abc" } };
      return {
        tree: [
          { path: "src", type: "tree" },
          { path: "src/index.ts", type: "blob", size: 100 },
          { path: "README.md", type: "blob", size: 50 },
        ],
      };
    });

    // buildTree("token", "user/repo/main/src", 0) scopes to src/
    const tree = await githubAdapter.buildTree!("token", "user/repo/main/src", 0);
    // rootPath="src" should scope to src/ subtree
    expect(tree.name).toBe("src");
    const flat = flattenTree(tree);
    expect(flat).toContain("index.ts");
    expect(flat).not.toContain("README.md");
  });
});

// ── resolveBranchPath (indirect via buildTree) ────────────────────────
describe("resolveBranchPath (indirect via buildTree)", () => {
  test("uses default_branch from /repos when no branch in ref", async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) return { default_branch: "develop" }; // /repos/owner/repo
      if (callCount === 2) return { object: { sha: "dev-sha" } }; // refs/heads/develop
      return { tree: [{ path: "file.ts", type: "blob", size: 10 }] };
    });

    const tree = await githubAdapter.buildTree!("token", "user/repo", 0);
    expect(tree).toBeDefined();
    // Verify refs endpoint was called
    expect(fetchCalls.some((c) => c.url.includes("git/refs/heads/develop"))).toBe(true);
  });

  test("throws when no branch resolves", async () => {
    mockFetch(() => ({ status: 404, body: {} }));

    await expect(githubAdapter.listChildren("token", "user/repo/nonexistent/path")).rejects.toThrow();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────
function flattenTree(tree: any): string[] {
  const names: string[] = [];
  if (tree.name) names.push(tree.name);
  for (const child of tree.children || []) {
    names.push(...flattenTree(child));
  }
  return names;
}
