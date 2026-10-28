/**
 * Gallery card metadata — category derivation + preview generation.
 * Pure functions, no IO. Server-side only (called from /api/share POST).
 */
import type { FileCategory, FewerNode } from "./types";

// ── Allowlist ──────────────────────────────────────────────────────────────

/** Gallery category is the dominant FileCategory from the graph's file nodes. */
const VALID_CATEGORIES: ReadonlySet<FileCategory> = new Set([
  "code", "config", "image", "document", "archive", "data", "media", "binary", "text",
]);

/** Cap for gallery_categories entries (top N). */
const MAX_CATEGORIES = 8;

/** Cap for gallery_preview children (first-level names shown in the card). */
const MAX_PREVIEW_CHILDREN = 6;

/** Max bytes for the serialized gallery_preview JSON. */
const PREVIEW_MAX_BYTES = 512;

// ── Derivation ─────────────────────────────────────────────────────────────

export interface GalleryCardMeta {
  gallery_category: string | null;
  gallery_categories: Record<string, number> | null;
  gallery_preview: { root: string; children: string[]; nodeCount: number } | null;
  author_name: string | null;
  author_username: string | null;
}

/**
 * Derive gallery card metadata from the graph payload and publisher profile.
 * Called server-side at publish time. All values are validated and capped
 * before storage — RLS only gates rows, not column values.
 */
export function deriveCardMeta(
  nodes: FewerNode[],
  profile: { first_name?: string | null; username?: string | null } | null,
): GalleryCardMeta {
  const fileNodes = nodes.filter((n) => n.data?.type === "file" && n.data?.category);

  // Category histogram
  const hist: Record<string, number> = {};
  for (const n of fileNodes) {
    const cat = n.data.category!;
    hist[cat] = (hist[cat] ?? 0) + 1;
  }

  // Primary category = highest count
  let primaryCat: string | null = null;
  let maxCount = 0;
  for (const [cat, count] of Object.entries(hist)) {
    if (count > maxCount) { maxCount = count; primaryCat = cat; }
  }

  // Top N categories (capped, valid only)
  const categories = Object.entries(hist)
    .filter(([cat]) => VALID_CATEGORIES.has(cat as FileCategory))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIES);

  // Root node + first-level children
  const root = nodes.find((n) => n.data?.isRoot);
  const rootName = root?.data?.label ?? "";
  const rootId = root?.id ?? "";
  const firstLevel = nodes
    .filter((n) => n.data?.parentId === rootId && n.id !== rootId)
    .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
    .slice(0, MAX_PREVIEW_CHILDREN)
    .map((n) => n.data?.label ?? "");

  const preview = rootName
    ? { root: rootName, children: firstLevel, nodeCount: nodes.length }
    : null;

  return {
    gallery_category: primaryCat && VALID_CATEGORIES.has(primaryCat as FileCategory) ? primaryCat : null,
    gallery_categories: categories.length > 0 ? Object.fromEntries(categories) : null,
    gallery_preview: validatePreview(preview),
    author_name: safeText(profile?.first_name, 100),
    author_username: safeText(profile?.username, 100),
  };
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Validate and cap gallery_preview. Returns null if it would exceed the byte cap. */
function validatePreview(
  preview: { root: string; children: string[]; nodeCount: number } | null,
): { root: string; children: string[]; nodeCount: number } | null {
  if (!preview) return null;
  const clean = {
    root: preview.root.slice(0, 200),
    children: preview.children.map((c) => c.slice(0, 100)),
    nodeCount: preview.nodeCount,
  };
  if (JSON.stringify(clean).length > PREVIEW_MAX_BYTES) return null;
  return clean;
}

/** Trim and cap a text field. Returns null for empty/missing values. */
function safeText(val: unknown, cap: number): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed.slice(0, cap) : null;
}
