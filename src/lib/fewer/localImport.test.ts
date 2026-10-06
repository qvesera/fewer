// T-102: client-side URL + GitHub import through the netFetch host seam.
// registerHostFetch fakes the main-process bridge; netFetch routes through it.
import { afterEach, describe, expect, test } from "bun:test";
import { importUrlLocal } from "./localImport";
import { netFetchIsHostBacked, registerHostFetch } from "./netFetch";

interface FakePage {
  status?: number;
  json?: unknown;
  text?: string;
}

/** Serve canned responses by exact URL; anything else 404s. */
function serve(pages: Record<string, FakePage>): void {
  registerHostFetch(async (url) => {
    const hit = pages[url];
    if (!hit) return new Response("", { status: 404 });
    if (hit.json !== undefined) {
      return new Response(JSON.stringify(hit.json), { status: hit.status ?? 200 });
    }
    return new Response(hit.text ?? "", { status: hit.status ?? 200 });
  });
}

afterEach(() => registerHostFetch(null));

/** Minimal Apache auto-index page (mirrors crawl.test.ts). */
function autoIndexHtml(folders: string[], files: { name: string; kb: number }[]): string {
  const rows = [
    '<a href="../">../</a>',
    ...folders.map((f) => `<a href="${f}/">${f}/</a>`),
    ...files.map((f) => `<a href="${f.name}">${f.name}</a>`),
  ];
  return `<html><head><title>Index of /x</title></head><body><pre>${rows.join("\n")}</pre></body></html>`;
}

describe("importUrlLocal — GitHub", () => {
  test("resolves branch → commit → recursive tree and reports truncation", async () => {
    serve({
      "https://api.github.com/repos/o/r/git/refs/heads/main": { json: { object: { sha: "c1" } } },
      "https://api.github.com/repos/o/r/git/commits/c1": { json: { tree: { sha: "t1" } } },
      "https://api.github.com/repos/o/r/git/trees/t1?recursive=1": {
        json: {
          tree: [
            { path: "src", type: "tree" },
            { path: "src/app.ts", type: "blob", size: 10 },
          ],
          truncated: true,
        },
      },
    });
    const { tree, truncated } = await importUrlLocal("https://github.com/o/r");
    expect(netFetchIsHostBacked()).toBe(true);
    expect(tree.name).toBe("r");
    expect(tree.type).toBe("folder");
    expect(tree.children!.map((c) => c.name)).toContain("src");
    expect(truncated).toBe(true);
  });

  test("subfolder URLs strip the prefix and name the root after the folder", async () => {
    serve({
      "https://api.github.com/repos/o/r/git/refs/heads/main": { json: { object: { sha: "c1" } } },
      "https://api.github.com/repos/o/r/git/commits/c1": { json: { tree: { sha: "t1" } } },
      "https://api.github.com/repos/o/r/git/trees/t1?recursive=1": {
        json: {
          tree: [
            { path: "src", type: "tree" },
            { path: "src/app.ts", type: "blob" },
          ],
        },
      },
    });
    const { tree } = await importUrlLocal("https://github.com/o/r/tree/main/src");
    expect(tree.name).toBe("src");
    expect(tree.children!.map((c) => c.name)).toEqual(["app.ts"]);
  });

  test("unresolvable repo throws a friendly error", async () => {
    serve({});
    await expect(importUrlLocal("https://github.com/nope/nope")).rejects.toThrow(/not found/);
  });
});

describe("importUrlLocal — file index URL", () => {
  test("crawls an auto-index page into a tree via the bridge", async () => {
    serve({
      "https://files.example.com/idx/": {
        text: autoIndexHtml(["sub"], [{ name: "a.txt", kb: 1 }]),
      },
      // Depth budget / 404: the subfolder listing fails → it still appears as a folder.
    });
    const { tree, truncated } = await importUrlLocal("https://files.example.com/idx/");
    expect(tree.type).toBe("folder");
    const names = tree.children!.map((c) => c.name);
    expect(names).toContain("a.txt");
    expect(names).toContain("sub");
    expect(truncated).toBe(false);
  });
});
