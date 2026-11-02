import { test, expect, afterEach } from "bun:test";
import { crawlTree } from "./crawl";

/** Minimal Apache auto-index page: anchors inside <pre>, names from href. */
function indexHtml(folders: string[] = [], files: { name: string; kb: number }[] = []): string {
  const rows = [
    ...folders.map((f) => `<a href="${f}/">${f}/</a>  2026-05-06 14:52    -`),
    ...files.map((f) => `<a href="${f.name}">${f.name}</a>  2026-06-10 14:08   ${f.kb}K`),
  ];
  return `<html><head><title>Index of /x</title></head><body><pre>${rows.join("\n")}</pre></body></html>`;
}

const realFetch = globalThis.fetch;
const calls: string[] = [];

/** Serve `pages` by exact URL; anything else 404s (fetchEntries → null). */
function stubFetch(pages: Record<string, string>) {
  calls.length = 0;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const html = pages[url];
    return Promise.resolve(
      html ? new Response(html, { status: 200 }) : new Response("", { status: 404 }),
    );
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("crawlTree respects maxDepth and only fetches pages it visits", async () => {
  stubFetch({
    "https://x/root/": indexHtml(["sub", "other"]),
    "https://x/root/sub/": indexHtml([], [{ name: "deep.txt", kb: 5 }]),
    "https://x/root/other/": indexHtml([]),
  });

  const { tree, truncated } = await crawlTree("https://x/root/", 1, 100);

  expect(tree.name).toBe("root");
  expect(tree.children!.map((c) => c.name)).toEqual(["other", "sub"]);
  // depth cap 1: children are listed but never fetched/descended
  expect(tree.children!.every((c) => c.children!.length === 0)).toBe(true);
  expect(calls).toEqual(["https://x/root/"]);
  expect(truncated).toBe(false);
});

test("crawlTree truncates at maxPages", async () => {
  stubFetch({
    "https://x/root/": indexHtml(["a", "b"]),
    "https://x/root/a/": indexHtml([], [{ name: "f.txt", kb: 1 }]),
    "https://x/root/b/": indexHtml([]),
  });

  // maxDepth 0 = unlimited, maxPages 1 = root only.
  const { tree, truncated } = await crawlTree("https://x/root/", 0, 1);

  expect(calls).toEqual(["https://x/root/"]);
  expect(tree.children!.map((c) => c.name)).toEqual(["a", "b"]);
  expect(truncated).toBe(true);
});

test("crawlTree sorts folders first and links files to their item URL", async () => {
  stubFetch({
    "https://x/root/": indexHtml(["zeta", "Alpha"], [
      { name: "b.txt", kb: 2 },
      { name: "a.txt", kb: 1 },
    ]),
    "https://x/root/zeta/": indexHtml([]),
    "https://x/root/Alpha/": indexHtml([]),
  });

  const { tree, truncated } = await crawlTree("https://x/root/", 0, 100);

  expect(tree.children!.map((c) => c.name)).toEqual(["Alpha", "zeta", "a.txt", "b.txt"]);
  expect(truncated).toBe(false);
  const file = tree.children!.find((c) => c.name === "a.txt")!;
  expect(file.type).toBe("file");
  expect(file.size).toBe(1024);
  expect(file.webUrl).toBe("https://x/root/a.txt");
  expect(tree.children!.find((c) => c.name === "Alpha")!.webUrl).toBe("https://x/root/Alpha/");
});

// ─── concurrency behaviour ────────────────────────────────────────
//
// The crawl is a rolling pool: a worker takes the next queued URL the moment
// its current page finishes. The old fixed-batch form waited for the whole
// batch, so one slow page idled the other slots until it timed out — these
// tests pin the difference.

const startAt: Record<string, number> = {};
const endAt: Record<string, number> = {};

/** Stub fetch with a per-URL response delay, recording fetch start/end times. */
function stubTimedFetch(pages: Record<string, string>, delayMs: (url: string) => number) {
  calls.length = 0;
  for (const k of [startAt, endAt]) for (const key of Object.keys(k)) delete k[key];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    startAt[url] = performance.now();
    return new Promise((resolve) => {
      setTimeout(() => {
        endAt[url] = performance.now();
        resolve(new Response(pages[url] ?? "", { status: pages[url] ? 200 : 404 }));
      }, delayMs(url));
    });
  }) as typeof fetch;
}

test("a slow page does not stall the pool: its finished siblings keep fetching", async () => {
  stubTimedFetch(
    {
      "https://x/root/": indexHtml(["slow", "f1"]),
      "https://x/root/slow/": indexHtml([]),
      "https://x/root/f1/": indexHtml(["g1"]),
      "https://x/root/f1/g1/": indexHtml([]),
    },
    (url) => (url.includes("slow") ? 150 : 5),
  );

  const { truncated } = await crawlTree("https://x/root/", 0, 100);

  // g1 is a grandchild of the fast f1, so it is only claimed once f1's listing
  // has been attached. A batch barrier would hold it until `slow` (150ms)
  // resolved; the rolling pool claims it ~5ms in.
  expect(endAt["https://x/root/slow/"]).toBeGreaterThan(0);
  expect(startAt["https://x/root/f1/g1/"]).toBeLessThan(endAt["https://x/root/slow/"]);
  expect(truncated).toBe(false);
});

test("the pool never claims past maxPages", async () => {
  const pages: Record<string, string> = { "https://x/root/": indexHtml(["a", "b", "c", "d", "e", "f", "g", "h"]) };
  for (const c of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    pages[`https://x/root/${c}/`] = indexHtml([]);
  }
  stubTimedFetch(pages, () => 2);

  const { truncated } = await crawlTree("https://x/root/", 0, 3);

  expect(calls.length).toBe(3);
  expect(truncated).toBe(true);
});

test("concurrency stays bounded and parallel", async () => {
  const pages: Record<string, string> = { "https://x/root/": indexHtml(["a", "b", "c", "d", "e", "f"]) };
  for (const c of ["a", "b", "c", "d", "e", "f"]) {
    pages[`https://x/root/${c}/`] = indexHtml([]);
  }
  stubTimedFetch(pages, () => 20);

  await crawlTree("https://x/root/", 0, 100);

  // Max requests in flight, from the recorded start/end times.
  const events = [
    ...Object.entries(startAt).map(([u, t]) => ({ t, delta: 1 })),
    ...Object.entries(endAt).map(([u, t]) => ({ t, delta: -1 })),
  ].sort((p, q) => p.t - q.t);
  let inFlight = 0;
  let maxInFlight = 0;
  for (const e of events) {
    inFlight += e.delta;
    maxInFlight = Math.max(maxInFlight, inFlight);
  }

  expect(maxInFlight).toBeGreaterThan(1);
  expect(maxInFlight).toBeLessThanOrEqual(4);
});

// ─── URL guard + redirects ────────────────────────────────────────────
//

test("redirects are followed and the final page is crawled", async () => {
  calls.length = 0;
  let hitFinal = false;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://x/root/") {
      return Promise.resolve(
        new Response("", { status: 302, headers: { location: "https://y/final/" } })
      );
    }
    hitFinal = true;
    return Promise.resolve(new Response(indexHtml([], [{ name: "f.txt", kb: 1 }]), { status: 200 }));
  }) as typeof fetch;

  const { tree } = await crawlTree("https://x/root/", 0, 100);

  expect(calls).toEqual(["https://x/root/", "https://y/final/"]);
  expect(hitFinal).toBe(true);
  expect(tree.children!.find((c) => c.name === "f.txt")).toBeDefined();
});

test("a redirect to a private address is not followed", async () => {
  calls.length = 0;
  let fetchedPrivate = false;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://x/root/") {
      return Promise.resolve(
        new Response("", { status: 302, headers: { location: "http://127.0.0.1/" } })
      );
    }
    fetchedPrivate = true;
    return Promise.resolve(new Response("should not be fetched", { status: 200 }));
  }) as typeof fetch;

  const isPrivate = (url: string) => !url.includes("127.0.0.1");
  const { tree } = await crawlTree("https://x/root/", 0, 100, { isAllowed: isPrivate });

  expect(calls).toEqual(["https://x/root/"]);
  expect(fetchedPrivate).toBe(false);
  expect(tree.children).toEqual([]);
});

test("redirect chains are capped at MAX_REDIRECT_HOPS", async () => {
  calls.length = 0;
  let hops = 0;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    hops++;
    if (hops <= 9) {
      return Promise.resolve(
        new Response("", { status: 302, headers: { location: `https://x/hop${hops}/` } })
      );
    }
    return Promise.resolve(new Response(indexHtml([]), { status: 200 }));
  }) as typeof fetch;

  const { tree } = await crawlTree("https://x/hop0/", 0, 100);

  expect(hops).toBe(9); // root + MAX_REDIRECT_HOPS hops, then abort
  expect(calls.length).toBe(9);
  expect(tree.children).toEqual([]);
});

test("discovered child URLs are screened before a page is fetched", async () => {
  const blocked = "http://127.0.0.1/";
  calls.length = 0;
  // Anchor href/inner text is an absolute private URL → child resolves to it.
  const evilHtml = `<html><body><pre><a href="${blocked}">${blocked}</a>  2026-01-01     -</pre></body></html>`;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://x/root/") {
      return Promise.resolve(
        new Response(indexHtml(["safe", blocked], [{ name: "note.txt", kb: 1 }]))
      );
    }
    return Promise.resolve(new Response(evilHtml));
  }) as typeof fetch;

  const isPublic = (url: string) => !url.includes("127.0.0.1");
  const { tree } = await crawlTree("https://x/root/", 0, 100, { isAllowed: isPublic });

  expect(calls).toEqual(["https://x/root/", "https://x/root/safe/"]);
  expect(tree.children!.map((c) => c.name)).toEqual(["safe", "note.txt"]);
});