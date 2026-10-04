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

/** True when building the static desktop export (set by scripts/build-desktop.sh). */
export function isDesktopExport(): boolean {
  return Boolean(process.env.DESKTOP_EXPORT);
}

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
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    if (UNPUBLISHED.has(`${type}/${slug}`)) continue;
    try {
      out.push(parseContentFile(await fs.readFile(path.join(dir, name), "utf8"), slug));
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
