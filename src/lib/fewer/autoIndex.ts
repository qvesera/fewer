import type { TreeEntry } from "./types";

/**
 * Parse an Apache-style auto-index HTML page into a flat list of entries.
 *
 * Handles the standard Apache "Index of /path" format:
 *   <a href="L1/">L1/</a>   ...  -   Current Level 1 released data
 *   <a href="file.txt">file.txt</a> ... 34K
 *
 * Also tolerates nginx autoindex (which uses a similar <a href> list).
 * Returns entries relative to the page URL; caller resolves full URLs.
 */
export interface AutoIndexEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
}

const SIZE_RE = /([\d.]+)\s*([KMG]?)(?:i?B)?/i;

function parseSize(raw: string): number | undefined {
  const m = raw.match(SIZE_RE);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  const unit = m[2].toUpperCase();
  const mult = unit === "K" ? 1024 : unit === "M" ? 1024 ** 2 : unit === "G" ? 1024 ** 3 : 1;
  return Math.round(n * mult);
}

/**
 * Extract entries from an auto-index HTML document.
 * Returns [] if the page is not an auto-index listing.
 */
export function parseAutoIndex(html: string): AutoIndexEntry[] {
  const entries: AutoIndexEntry[] = [];

  // Grab the <pre> listing block (Apache) or fall back to whole body (nginx).
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const block = pre ? pre[1] : html;

  // Match each anchor: <a href="URL">NAME</a> followed by optional size text.
  const anchorRe = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*([^\n<]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(block)) !== null) {
    const href = m[1];
    let name = m[2].replace(/<[^>]+>/g, "").trim();
    const rest = m[3].trim();

    // Skip sort links (?C=N;O=D) and parent directory.
    if (href.startsWith("?")) continue;
    if (name === "Parent Directory" || name === "../") continue;
    if (!name) continue;

    const isDir = href.endsWith("/");
    if (isDir) name = name.replace(/\/+$/, "");

    // Size is the whitespace-delimited column that looks like a byte count
    // (e.g. "34K", "1.5G"). Dates contain "-", so filter those out.
    const size =
      isDir || !rest
        ? undefined
        : (() => {
            const tokens = rest.split(/\s{2,}|\t/).map((t) => t.trim()).filter(Boolean);
            const sizeTok = tokens.find((t) => !t.includes("-") && SIZE_RE.test(t));
            return sizeTok ? parseSize(sizeTok) : undefined;
          })();

    entries.push({ name, type: isDir ? "folder" : "file", size });
  }

  return entries;
}

/**
 * Build a TreeEntry from a list of auto-index entries, recursing into
 * subdirectories via the provided fetcher. `fetcher` returns the parsed
 * entries for a given directory URL, or null on failure.
 *
 * @param url        Full URL of the directory being listed.
 * @param fetcher    Async function: given a directory URL, return its entries.
 * @param depth      Current recursion depth (0 = root).
 * @param maxDepth   Max recursion depth (0 = unlimited).
 * @param maxPages   Max total pages fetched across the whole crawl.
 * @param state      Shared crawl state (page counter + visited set).
 */
export interface CrawlState {
  pages: number;
  visited: Set<string>;
}

export async function buildTreeFromAutoIndex(
  url: string,
  fetcher: (url: string) => Promise<AutoIndexEntry[] | null>,
  depth: number,
  maxDepth: number,
  maxPages: number,
  state: CrawlState
): Promise<{ tree: TreeEntry; truncated: boolean }> {
  const name = decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "root");
  const tree: TreeEntry = { name, type: "folder", children: [] };
  let truncated = false;

  if (state.pages >= maxPages) return { tree, truncated: true };
  if (maxDepth > 0 && depth >= maxDepth) return { tree, truncated: false };

  state.pages++;
  state.visited.add(url);

  const entries = await fetcher(url);
  if (!entries) return { tree, truncated: false };

  for (const entry of entries) {
    if (entry.type === "folder") {
      const childUrl = new URL(entry.name + "/", url).href;
      if (state.visited.has(childUrl)) continue;
      const child = await buildTreeFromAutoIndex(
        childUrl,
        fetcher,
        depth + 1,
        maxDepth,
        maxPages,
        state
      );
      tree.children!.push(child.tree);
      if (child.truncated) truncated = true;
    } else {
      tree.children!.push({ name: entry.name, type: "file", size: entry.size });
    }
  }

  // Sort: folders first, then alphabetical.
  tree.children!.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { tree, truncated };
}