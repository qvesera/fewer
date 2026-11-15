import type { FewerEdge, FewerNode } from "./types";
import { formatSize, providerLabelFromSource } from "./nodeVisuals";
import { plural } from "./plural";
import { symlinkBadgeText } from "./symlinkDisplay";

/**
 * Content model for every context menu the canvas opens (card, edge, canvas).
 *
 * Pure by design — no React, no store, no @xyflow/react — so the *content* of a
 * menu (its title, subtitle and the Details rows) is unit-testable without
 * mounting a canvas, the same split `batchActions.ts` / `batchSelect.ts` use for
 * menu *actions*. The components only render what these functions return.
 */
export interface MenuHeader {
  /** What was right-clicked: the card's name, "Canvas", "Connection", … */
  title: string;
  /** Where it sits / what it carries: path, "3 folders · 4 files", "a → a/b". */
  subtitle?: string;
}

export interface InfoRow {
  id: string;
  label: string;
  value: string;
}

type NodeLike = Pick<FewerNode, "data">;

/** `label` excludes the extension for files (see TreeEntry) — reassemble it. */
export function fullNodeLabel(node: NodeLike): string {
  const { label, extension } = node.data;
  return extension ? `${label}.${extension}` : label;
}

/**
 * Human name for a graph's origin. The synthetic values below have no provider,
 * so `providerLabelFromSource` would answer "Provider" for all of them; URL and
 * cloud sources keep going through it (GitHub, OneDrive, a file-index hostname).
 */
export function sourceLabel(dataSource: string | null | undefined): string {
  if (!dataSource) return "This canvas";
  switch (dataSource) {
    case "directory": return "Local disk";
    case "file": return "Imported file";
    case "shared": return "Shared link";
    case "sample": return "Sample graph";
    case "saved": return "Saved graph";
    default: return providerLabelFromSource(dataSource);
  }
}

/** Header for a single card's menu: the name, with its path underneath. */
export function nodeMenuHeader(node: NodeLike): MenuHeader {
  const title = fullNodeLabel(node) || node.data.path || "Card";
  const subtitle = node.data.path && node.data.path !== title ? node.data.path : undefined;
  return { title, subtitle };
}

/** Selected card counts, split the way the header reports them. */
export function selectionCounts(
  nodes: NodeLike[],
  ids: string[],
): { selected: number; folders: number; files: number } {
  const byId = new Map<string, NodeLike>();
  for (const n of nodes) byId.set((n as unknown as { id: string }).id, n);
  let folders = 0;
  let files = 0;
  for (const id of ids) {
    const type = byId.get(id)?.data.type;
    if (type === "folder") folders++;
    else if (type === "file") files++;
  }
  return { selected: ids.length, folders, files };
}

/** Header for a multi-selection menu — the count, then what it is made of. */
export function selectionMenuHeader(counts: {
  selected: number;
  folders: number;
  files: number;
}): MenuHeader {
  const parts: string[] = [];
  if (counts.folders > 0) parts.push(plural(counts.folders, "folder"));
  if (counts.files > 0) parts.push(plural(counts.files, "file"));
  return {
    title: `${plural(counts.selected, "item")} selected`,
    subtitle: parts.length > 0 ? parts.join(" · ") : undefined,
  };
}

/** Header for a connection: what it is, then which cards it joins. */
export function edgeMenuHeader(
  edge: Pick<FewerEdge, "source" | "target">,
  nodes: Array<NodeLike & { id: string }>,
): MenuHeader {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const from = byId.get(edge.source);
  const to = byId.get(edge.target);
  return {
    title: "Connection",
    subtitle: from && to ? `${fullNodeLabel(from)} → ${fullNodeLabel(to)}` : undefined,
  };
}

/** Header for the background menu: the canvas, and how many cards it holds. */
export function canvasMenuHeader(opts: { nodeCount: number; hiddenCount?: number }): MenuHeader {
  const hidden = opts.hiddenCount ?? 0;
  return {
    title: "Canvas",
    subtitle: `${plural(opts.nodeCount, "card")}${hidden > 0 ? ` · ${hidden} hidden` : ""}`,
  };
}

/**
 * The Details rows for one card — the READ-ONLY half of the old "Info" submenu,
 * which had nothing to show whenever none of its actions applied (a folder from
 * a repo or URL import has no web URL and no disk path, so the submenu opened
 * empty). Type and Path always exist, so the submenu is never blank again.
 */
export function nodeInfoRows(opts: {
  node: NodeLike;
  dataSource?: string | null;
  childCount?: number;
  folderCount?: number;
  fileCount?: number;
  totalSize?: number;
  tagLabels?: string[];
}): InfoRow[] {
  const { data } = opts.node;
  const rows: InfoRow[] = [
    { id: "type", label: "Type", value: typeValue(data.type, data) },
    { id: "path", label: "Path", value: data.path || "—" },
  ];

  if (data.type === "folder") {
    if (typeof opts.folderCount === "number" && typeof opts.fileCount === "number") {
      rows.push({
        id: "contents",
        label: "Contents",
        value: `${plural(opts.folderCount, "folder")} · ${plural(opts.fileCount, "file")}`,
      });
    } else if (typeof opts.childCount === "number") {
      rows.push({ id: "contents", label: "Contents", value: plural(opts.childCount, "item") });
    }
  }

  // formatSize returns "" for 0 — an unknown/empty size is simply not a row.
  const size = formatSize(data.type === "folder" ? opts.totalSize ?? 0 : data.size ?? 0);
  if (size) rows.push({ id: "size", label: "Size", value: size });

  rows.push({ id: "source", label: "Source", value: sourceLabel(opts.dataSource) });
  rows.push({
    id: "tags",
    label: "Tags",
    value: opts.tagLabels && opts.tagLabels.length > 0 ? opts.tagLabels.join(", ") : "None",
  });
  if (data.symlink) rows.push({ id: "link", label: "Link", value: symlinkBadgeText(data.symlink) });

  return rows;
}

/** "Folder" / "File · .ts · code", with the card's flags appended. */
function typeValue(
  type: "folder" | "file",
  data: NodeLike["data"],
): string {
  const parts = [type === "folder" ? "Folder" : "File"];
  if (data.extension) parts.push(`.${data.extension}`);
  if (data.category) parts.push(data.category);
  if (data.isRoot) parts.push("root");
  if (data.isArchive) parts.push("archive");
  if (data.symlink) parts.push("symlink");
  return parts.join(" · ");
}
