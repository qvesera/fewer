import type { ComponentType } from "react";
import { FileCode, FileJson, FileImage, FileText, FileArchive, FileSpreadsheet, FileVideo, File as FileIcon, FileType } from "lucide-react";
import type { FileCategory } from "./types";

export const CATEGORY_ICON: Record<FileCategory, ComponentType<{ className?: string }>> = {
  code: FileCode,
  config: FileJson,
  image: FileImage,
  document: FileText,
  archive: FileArchive,
  data: FileSpreadsheet,
  media: FileVideo,
  binary: FileIcon,
  text: FileType,
};

/** Child badges count edges, not just existing/visible nodes. */
export function folderChildCount(id: string, isFolder: boolean, edges: FewerEdge[]): number {
  return isFolder ? (childrenIndexOf(edges).get(id)?.length ?? 0) : 0;
}


import { Position } from "@xyflow/react";
import type { FewerNode, FewerEdge } from "./types";
import { childrenIndexOf, nodeIndexOf } from "./graphIndex";

export function getHandlePositions(layoutDirection?: string): {
  source: Position;
  target: Position;
} {
  switch (layoutDirection) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
    default:
      return { source: Position.Bottom, target: Position.Top };
  }
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Map a dataSource prefix to a display label for "Open in provider". */
export function providerLabelFromSource(dataSource: string | null): string {
  if (!dataSource) return "Provider";
  if (dataSource.startsWith("cloud:github")) return "GitHub";
  if (dataSource.startsWith("cloud:google-drive")) return "Google Drive";
  if (dataSource.startsWith("cloud:onedrive")) return "OneDrive";
  if (dataSource.startsWith("cloud:sharepoint")) return "SharePoint";
  if (dataSource.startsWith("cloud:azure-devops")) return "Azure DevOps";
  if (dataSource.startsWith("cloud:azure-blob")) return "Azure Blob";
  // URL imports (GitHub repo or a public file index) carry real source URLs.
  if (dataSource.startsWith("url:")) {
    try {
      const u = new URL(dataSource.slice(4));
      if (u.hostname === "github.com") return "GitHub";
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "Site";
    }
  }
  return "Provider";
}

/** Select the stem, but select an entire dotfile or extensionless name. */
export function renameSelection(label: string): readonly [number, number] {
  const dot = label.lastIndexOf(".");
  return [0, dot > 0 ? dot : label.length];
}

/** Rows are unique existing nodes; counters intentionally count edges, even dangling ones. */
export function sortedChildRows(
  parentId: string,
  nodes: FewerNode[],
  edges: FewerEdge[],
): FewerNode[] {
  const childIds = childrenIndexOf(edges).get(parentId);
  if (!childIds || childIds.length === 0) return [];
  const nodeMap = nodeIndexOf(nodes);
  const seen = new Set<string>();
  const children: FewerNode[] = [];
  // Edge order, then the app-wide sort below. Equal labels can't tie: the
  // connect/rename rules keep sibling names unique, so the sort is a total
  // order over the rows and the pre-sort order is unobservable.
  for (const id of childIds) {
    if (seen.has(id)) continue;
    const node = nodeMap.get(id);
    if (!node) continue;
    seen.add(id);
    children.push(node);
  }
  children.sort((a, b) => {
    if (a.data.type !== b.data.type) return a.data.type === "folder" ? -1 : 1;
    return a.data.label.localeCompare(b.data.label);
  });
  return children;
}

export function nodeChildren(
  id: string,
  isFolder: boolean,
  nodes: FewerNode[],
  edges: FewerEdge[],
  visibleIds: ReadonlySet<string>,
): { children: FewerNode[]; childCount: number; hiddenChildCount: number } {
  if (!isFolder) return { children: [], childCount: 0, hiddenChildCount: 0 };
  const childIds = childrenIndexOf(edges).get(id) ?? [];
  let hiddenChildCount = 0;
  for (const cid of childIds) if (!visibleIds.has(cid)) hiddenChildCount++;
  return {
    children: sortedChildRows(id, nodes, edges),
    childCount: childIds.length,
    hiddenChildCount,
  };
}
