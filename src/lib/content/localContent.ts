// Build-time reader for the in-repo docs/blog markdown (T-092).
//
// `content/docs/*.md` and `content/blog/*.md` are the source of record; the web
// app serves them from the `content_pages` table (scripts/gen-seed-content.py
// turns the same files into the SQL seed). The desktop static export has no
// server to query, so it renders these files directly — which also means
// `bun run build:desktop` works offline (CI, air-gapped builds) and the desktop
// app ships its docs rather than depending on the network.

import fs from "node:fs/promises";
import path from "node:path";
import { isDesktopExport } from "./exportMode";

export { isDesktopExport };

export type ContentType = "docs" | "blog";

export interface LocalContent {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string;
  content: string;
}

const DIRS: Record<ContentType, string> = {
  docs: "content/docs",
  blog: "content/blog",
};

// Mirrors UNPUBLISHED_ON_INSERT in scripts/gen-seed-content.py: these slugs are
// hidden on the site, so the desktop export must not publish them either.
const UNPUBLISHED = new Set(["docs/plans"]);

// Web-only docs the standalone shell must not ship (T-104): cloud accounts,
// pricing, hosted-service legal pages, PWA install, deployment. The export's
// docs variant keeps the locally relevant guides plus the app-only pages.
export const SHELL_HIDDEN_DOCS = new Set([
  "accounts",
  "cloud",
  "deployment",
  "plans",
  "privacy",
  "pwa-install",
  "sharing",
  "terms",
  "watch",
]);

// App-only docs (T-104): shipped in the desktop export, never on the web
// (gen-seed-content.py skips them too — the file is the single source).
export const APP_ONLY_DOCS = new Set(["desktop"]);

// Blogs are web-only: release posts are marketing; the standalone ships none
// (the build also removes out/blog — belt and braces for prerendered pages).
const SHELL_DROPS_BLOG = true;

/** True when building the static desktop export (set by scripts/build-desktop.sh).
 *  Re-exported from ./exportMode (dependency-free) so client graphs can import it. */

/**
 * Split one markdown file into front matter fields + body. Mirrors the parser
 * semantics of gen-seed-content.py (body keeps any later `---` fences).
 */
export function parseContentFile(text: string, slug: string): LocalContent {
  // Python's str.split("---", 2): the body keeps the remainder, so use indexOf
  // rather than split() (JS truncates when a limit is passed).
  const open = text.indexOf("---");
  const close = open === -1 ? -1 : text.indexOf("---", open + 3);
  const front = open !== -1 && close !== -1 ? text.slice(open + 3, close) : "";
  const body = close !== -1 ? text.slice(close + 3) : text;

  const field = (name: string): string => {
    const m = new RegExp(`^${name}:\\s*(.+)$`, "m").exec(front);
    return m ? m[1].trim() : "";
  };

  return {
    slug,
    title: field("title"),
    description: field("description"),
    date: field("date"),
    author: field("author"),
    tags: field("tags"),
    content: body.replace(/^\n+/, ""),
  };
}

// ── Shell variants of page CONTENT (T-104) ──────────────────────────────
//
// Pages are filtered per mode, but individual pages also carry sections and
// links that only make sense on one side. Two mechanisms keep one markdown
// file serving both surfaces:
//
//   <!-- shell:off --> … <!-- /shell:off -->   web-only block
//   <!-- shell:on  --> … <!-- /shell:on  -->    desktop-only block
//
// The markers never reach either output (they are consumed on both sides).
function applyShellBlocks(content: string): string {
  const isExport = isDesktopExport();
  return content
    .replace(/<!--\s*shell:off\s*-->([\s\S]*?)<!--\s*\/shell:off\s*-->/g, isExport ? "" : "$1")
    .replace(/<!--\s*shell:on\s*-->([\s\S]*?)<!--\s*\/shell:on\s*-->/g, isExport ? "$1" : "")
    // Stripping a block can leave \n\n\n junctions; the markdown renderer
    // splits on exactly "\n\n" and a chunk starting with \n defeats its
    // heading detection (## renders as literal text). Collapse runs of 3+.
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Export only: markdown links to pages the standalone doesn't ship degrade to
 * plain text — hand-edited docs can reintroduce dead `/docs/<hidden>` (or
 * /blog, /gallery, …) links and they must not appear as clickable leaks.
 * Anchors on live pages (`/docs/shortcuts#ctrl-a`) survive.
 */
export function neutralizeDeadShellLinks(content: string): string {
  return content.replace(/\[([^\]]+)\]\(\s*(\/[^)\s]*)\s*\)/g, (full, label: string, href: string) => {
    const target = (href.split("#")[0] || href).replace(/\/$/, "");
    if (target === "/docs") return full;
    const m = /^\/docs\/([a-z0-9-]+)$/i.exec(target);
    if (m && !SHELL_HIDDEN_DOCS.has(m[1])) return full;
    return label; // plain text — no dead navigation in the shell
  });
}

/** Every published markdown file of a type, sorted by title. */
export async function listLocalContent(type: ContentType): Promise<LocalContent[]> {
  const dir = path.join(process.cwd(), DIRS[type]);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }

  const out: LocalContent[] = [];
  // Standalone export (T-104): no blogs, web-only docs hidden, app-only docs in.
  if (type === "blog" && SHELL_DROPS_BLOG && isDesktopExport()) return [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    if (UNPUBLISHED.has(`${type}/${slug}`)) continue;
    if (type === "docs") {
      if (APP_ONLY_DOCS.has(slug) && !isDesktopExport()) continue;
      if (SHELL_HIDDEN_DOCS.has(slug) && isDesktopExport()) continue;
    }
    try {
      const parsed = parseContentFile(await fs.readFile(path.join(dir, name), "utf8"), slug);
      // Mode-conditional sections (both modes) + dead-link neutralization
      // (export only) — the shell must never show links to pages it lacks.
      parsed.content = applyShellBlocks(parsed.content);
      if (type === "docs" && isDesktopExport()) {
        parsed.content = neutralizeDeadShellLinks(parsed.content);
      }
      out.push(parsed);
    } catch {
      // Unreadable file: skip it rather than fail the export.
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** One page by slug (null when the markdown file is absent). */
export async function getLocalContent(
  type: ContentType,
  slug: string,
): Promise<LocalContent | null> {
  return (await listLocalContent(type)).find((c) => c.slug === slug) ?? null;
}

/** Slugs only — cheap enough for generateStaticParams, no front matter needed. */
export async function listLocalSlugs(type: ContentType): Promise<string[]> {
  return (await listLocalContent(type)).map((c) => c.slug);
}
