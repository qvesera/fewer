import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Outbound URL guard for POST /api/crawl.
 *
 * The crawl route is an unauthenticated server-side fetcher, so every URL it
 * touches (root URL, redirect targets, and links discovered inside a listing)
 * must be screened before the server connects. This module runs only on the
 * server: it is imported only by the server route (src/app/api/crawl/route.ts).
 * The client-side crawl path in localImport.ts stays guard-free and is
 * CORS-bound by the browser anyway. Node's `dns`/`net` will fail loud if this
 * module is ever imported in a client bundle — intended, never silent.
 *
 * Checks, in order:
 *   1. URL parses and is http(s).
 *   2. IP literals are checked directly against the private/reserved ranges below.
 *   3. Hostnames are resolved with dns.lookup({all: true}) and EVERY returned
 *      address is screened — DNS must not be able to bypass the guard by
 *      resolving to a private address. A hostname that fails to resolve is
 *      rejected (a crawl target must exist in public DNS).
 *
 * Blocked IPv4: RFC1918 (10/8, 172.16/12, 192.168/16), loopback (127/8),
 * link-local (169.254/16), CGNAT (100.64/10), multicast/reserved (224/4, 240/4),
 * 0/8, IETF protocol assignments (192.0.0/24), TEST-NET (192.0.2/24),
 * 6to4 relay (192.88.99/24), benchmarking (198.18/15).
 * Blocked IPv6: loopback (::1/128), unique local (fc00::/7), link-local
 * (fe80::/10), multicast (ff00::/8), documentation (2001:db8::/32), and
 * IPv4-mapped addresses (::ffff:a.b.c.d) screened as their IPv4 payload.
 */
const MAX_REDIRECT_HOPS = 8;

function ipv4ToInt(a: string): number | null {
  const parts = a.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0 || n > 255 || String(n) !== p) return null;
    return n;
  });
  if (nums.some((n) => n === null)) return null;
  return ((nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!) >>> 0;
}

function inRange(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

// [low, high] inclusive, as unsigned 32-bit ints.
const IPV4_BLOCKED: [number, number][] = [
  [ipv4ToInt("0.0.0.0")!, ipv4ToInt("0.255.255.255")!],
  [ipv4ToInt("10.0.0.0")!, ipv4ToInt("10.255.255.255")!],
  [ipv4ToInt("100.64.0.0")!, ipv4ToInt("100.127.255.255")!],
  [ipv4ToInt("127.0.0.0")!, ipv4ToInt("127.255.255.255")!],
  [ipv4ToInt("169.254.0.0")!, ipv4ToInt("169.254.255.255")!],
  [ipv4ToInt("172.16.0.0")!, ipv4ToInt("172.31.255.255")!],
  [ipv4ToInt("192.0.0.0")!, ipv4ToInt("192.0.0.255")!],
  [ipv4ToInt("192.0.2.0")!, ipv4ToInt("192.0.2.255")!],
  [ipv4ToInt("192.88.99.0")!, ipv4ToInt("192.88.99.255")!],
  [ipv4ToInt("192.168.0.0")!, ipv4ToInt("192.168.255.255")!],
  [ipv4ToInt("198.18.0.0")!, ipv4ToInt("198.19.255.255")!],
  [ipv4ToInt("224.0.0.0")!, ipv4ToInt("239.255.255.255")!],
  [ipv4ToInt("240.0.0.0")!, ipv4ToInt("255.255.255.255")!],
];

function isBlockedIpv4(value: number): boolean {
  return IPV4_BLOCKED.some(([low, high]) => inRange(value, low, high));
}

function isBlockedIpv6(addr: string): boolean {
  const a = addr.toLowerCase();
  // IPv4-mapped IPv6: screen the embedded IPv4 address.
  if (a.startsWith("::ffff:")) {
    const embedded = a.slice("::ffff:".length);
    const value = ipv4ToInt(embedded);
    return value !== null && isBlockedIpv4(value);
  }
  if (a === "::" || a.startsWith("::1")) return true; // unspecified / loopback
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local fc00::/7
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return true; // link-local fe80::/10
  if (a.startsWith("ff")) return true; // multicast ff00::/8
  if (a.startsWith("2001:0db8") || a.startsWith("2001:db8")) return true; // documentation
  return false;
}

function isBlockedIp(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    const value = ipv4ToInt(addr);
    return value !== null && isBlockedIpv4(value);
  }
  if (family === 6) return isBlockedIpv6(addr);
  return true; // not an IP literal at all
}

type GuardResult = { ok: true } | { ok: false; reason: string };

export async function isAllowedCrawlUrl(raw: string): Promise<GuardResult> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "only http and https URLs may be crawled" };
  }
  if (!u.hostname) {
    return { ok: false, reason: "URL has no host" };
  }

  if (isBlockedIp(u.hostname)) {
    return { ok: false, reason: `${u.hostname} resolves to a private address` };
  }

  // Hostname: resolve and screen every address. A name that will not resolve
  // is not a crawl target — reject rather than letting the fetch fail later.
  let addresses: string[];
  try {
    // bun/node resolve promises.lookup({all: true}) to the address array itself.
    const resolved = await lookup(u.hostname, { all: true, verbatim: true });
    addresses = resolved.map((entry) => entry.address);
  } catch {
    return { ok: false, reason: `host ${u.hostname} does not resolve` };
  }
  if (addresses.some((a) => isBlockedIp(a))) {
    return { ok: false, reason: `${u.hostname} resolves to a private address` };
  }
  return { ok: true };
}

export { MAX_REDIRECT_HOPS };