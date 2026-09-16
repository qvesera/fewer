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