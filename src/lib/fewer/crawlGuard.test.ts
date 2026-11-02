import { describe, expect, test } from "bun:test";
import { isAllowedCrawlUrl } from "./crawlGuard";

/*
 * Deterministic subset: IP literals never touch DNS, so these assertions hold
 * in any environment. Hostnames are resolved via dns.lookup({all: true}) and
 * every address is screened — a name that fails to resolve is rejected — but
 * hostname outcomes depend on test-environment DNS and are intentionally not
 * asserted here.
 */
describe("isAllowedCrawlUrl", () => {
  const allowed = (url: string) =>
    expect(isAllowedCrawlUrl(url)).resolves.toEqual({ ok: true });
  const rejected = (url: string) =>
    expect(isAllowedCrawlUrl(url)).resolves.toMatchObject({ ok: false });

  test("rejects malformed input", () => {
    rejected("not a url");
    rejected("");
    rejected("   ");
  });

  test("rejects non-http(s) schemes", () => {
    rejected("ftp://example.com/");
    rejected("file:///etc/passwd");
    rejected("javascript:alert(1)");
    rejected("data:text/html,<script>");
  });

  test("rejects private and reserved IPv4 literals", () => {
    rejected("http://127.0.0.1/");
    rejected("http://127.0.0.1:8080/");
    rejected("http://10.0.0.1/");
    rejected("http://172.16.0.1/");
    rejected("http://172.31.255.255/");
    rejected("http://192.168.1.1/");
    rejected("http://169.254.169.254/"); // link-local / IMDS
    rejected("http://100.64.0.1/"); // CGNAT
    rejected("http://0.0.0.0/");
    rejected("http://192.0.2.1/"); // TEST-NET
    rejected("http://224.0.0.1/"); // multicast
    rejected("http://240.0.0.1/"); // reserved
  });

  test("rejects private IPv6 literals", () => {
    rejected("http://[::1]/");
    rejected("http://[::1]/x");
    rejected("http://[fd00::1]/");
    rejected("http://[fe80::1]/");
    rejected("http://[ff02::1]/");
    rejected("http://[::ffff:127.0.0.1]/"); // IPv4-mapped loopback
    rejected("http://[2001:db8::1]/"); // documentation
  });

  test("allows public IPv4 literals", () => {
    allowed("http://93.184.216.34/"); // example.com
    allowed("https://1.1.1.1/");
  });
});