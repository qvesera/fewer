import { describe, expect, test } from "bun:test";
import { POST } from "./route";

/*
 * SSRF guard tests for POST /api/crawl. The guard runs before any Supabase or
 * fetch call, so these tests need no mocks and no network: private-address
 * inputs must be rejected with 400 outright.
 */
function req(body: unknown): Request {
  return new Request("http://localhost/api/crawl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/crawl", () => {
  test("missing url -> 400", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  test("non-url body -> 400", async () => {
    expect((await POST(req({ url: "not a url" }))).status).toBe(400);
  });

  test("non-http(s) scheme -> 400", async () => {
    expect((await POST(req({ url: "ftp://example.com/" }))).status).toBe(400);
    expect((await POST(req({ url: "file:///etc/passwd" }))).status).toBe(400);
  });

  test("private IPv4 literals -> 400", async () => {
    expect((await POST(req({ url: "http://127.0.0.1/" }))).status).toBe(400);
    expect((await POST(req({ url: "http://10.0.0.1/" }))).status).toBe(400);
    expect((await POST(req({ url: "http://172.16.0.1/" }))).status).toBe(400);
    expect((await POST(req({ url: "http://192.168.1.1/" }))).status).toBe(400);
    expect((await POST(req({ url: "http://169.254.169.254/" }))).status).toBe(400);
  });

  test("private IPv6 literals -> 400", async () => {
    const bad = [
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
    ];
    for (const url of bad) {
      expect((await POST(req({ url }))).status).toBe(400);
    }
  });

  test("unresolvable hostname -> 400", async () => {
    const url = "http://this-name-cannot-possibly-exist.test/";
    expect((await POST(req({ url }))).status).toBe(400);
  });
});
