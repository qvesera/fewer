import type { FewerNode, FewerEdge, DirectoryStats } from "../fewer/types";

export function computeStats(
  nodes: FewerNode[],
  edges: FewerEdge[],
): DirectoryStats {
  let totalFiles = 0;
  let totalFolders = 0;
  let totalSize = 0;
  const byCategory: DirectoryStats["byCategory"] = {
    code: 0,
    config: 0,
    image: 0,
    document: 0,
    archive: 0,
    data: 0,
    media: 0,
    binary: 0,
    text: 0,
  };

  for (const n of nodes) {
    if (n.data.type === "folder") {
      totalFolders += 1;
    } else {
      totalFiles += 1;
      totalSize += n.data.size ?? 0;
      if (n.data.category) {
        byCategory[n.data.category] += 1;
      }
    }
  }

  return {
    totalFiles,
    totalFolders,
    totalSize,
    byCategory,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/** Fuzzy match a query against a target string. Returns true if every char
 * of the query appears in order (case-insensitive) in the target. */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
