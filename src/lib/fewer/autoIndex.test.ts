import { test, expect } from "bun:test";
import { parseAutoIndex, buildTreeFromAutoIndex } from "./autoIndex";

const SAMPLE = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">
<html>
 <head>
  <title>Index of /EUI/data</title>
 </head>
 <body>
<h1>Index of /EUI/data</h1>
<pre><img src="/icons/blank.gif" alt="Icon "> <a href="?C=N;O=D">Name</a>                      <a href="?C=M;O=A">Last modified</a>      <a href="?C=S;O=A">Size</a>  <a href="?C=D;O=A">Description</a><hr><img src="/icons/back.gif" alt="[PARENTDIR]"> <a href="/EUI/">Parent Directory</a>                               -   
<img src="/icons/folder.gif" alt="[DIR]"> <a href="L1/">L1/</a>                       2026-05-06 14:52    -   Current Level 1 released data
<img src="/icons/folder.gif" alt="[DIR]"> <a href="L2/">L2/</a>                       2026-05-07 02:13    -   Current Level 2 released data
<img src="/icons/text.gif" alt="[TXT]"> <a href="latest_release_notes.html">latest_release_notes.html</a> 2026-06-10 14:08   34K  Release notes
<img src="/icons/compressed.gif" alt="[   ]"> <a href="metadata.zip">metadata.zip</a>              2026-06-02 10:31  1.5G  SQLite database
<hr></pre>
<address>Apache/2.4.41 (Ubuntu) Server at www.sidc.be Port 443</address>
</body></html>`;

test("parseAutoIndex extracts dirs and files, skips sort + parent", () => {
  const entries = parseAutoIndex(SAMPLE);
  expect(entries).toEqual([
    { name: "L1", type: "folder" },
    { name: "L2", type: "folder" },
    { name: "latest_release_notes.html", type: "file", size: 34 * 1024 },
    { name: "metadata.zip", type: "file", size: Math.round(1.5 * 1024 ** 3) },
  ]);
});

test("parseAutoIndex returns [] for non-index page", () => {
  expect(parseAutoIndex("<html><body>hello</body></html>")).toEqual([]);
});

test("buildTreeFromAutoIndex recurses and respects maxDepth", async () => {
  const fetcher = async (url: string) => {
    if (url.endsWith("root/")) {
      return [
        { name: "sub", type: "folder" as const },
        { name: "a.txt", type: "file" as const, size: 10 },
      ];
    }
    if (url.endsWith("sub/")) {
      return [{ name: "deep.txt", type: "file" as const, size: 5 }];
    }
    return null;
  };

  const state = { pages: 0, visited: new Set<string>() };
  const { tree, truncated } = await buildTreeFromAutoIndex(
    "https://x/root/",
    fetcher,
    0,
    1,
    100,
    state
  );

  expect(tree.name).toBe("root");
  expect(tree.children!.map((c) => c.name)).toEqual(["sub", "a.txt"]);
  // maxDepth=1 means we don't recurse into sub
  expect(tree.children![0].children).toEqual([]);
  expect(truncated).toBe(false);
});

test("buildTreeFromAutoIndex truncates at maxPages", async () => {
  const fetcher = async () => [{ name: "sub", type: "folder" as const }];
  const state = { pages: 0, visited: new Set<string>() };
  const { tree, truncated } = await buildTreeFromAutoIndex(
    "https://x/root/",
    fetcher,
    0,
    0,
    1,
    state
  );
  expect(tree.children).toEqual([{ name: "sub", type: "folder", children: [] }]);
  expect(truncated).toBe(true);
});