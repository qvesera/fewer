"use client";
// Path-reset helper after edge removal, verbatim from graphSlice.ts.
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { getDescendants } from "@/lib/fewer/validation";

/**
 * After removing edges, reset the path of any node that lost its last parent edge
 * (and of its descendants) so breadcrumbs reflect the new root-level location.
 * Returns the updated nodes plus the path changes for the history op.
 */
export function unparentSubtree(
  nodes: FewerNode[],
  edges: FewerEdge[],
  removedEdges: FewerEdge[],
): { nodes: FewerNode[]; pathChanges: { nodeId: string; prevPath: string; nextPath: string }[] } {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }
  const rootless = new Set<string>();
  for (const e of removedEdges) {
    const ps = (incoming.get(e.target) ?? []).filter((p) => !removedEdges.some((re) => re.source === p && re.target === e.target));
    if (ps.length === 0) rootless.add(e.target);
  }
  const pathChanges: { nodeId: string; prevPath: string; nextPath: string }[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const next = nodes.map((n) => ({ ...n }));
  for (const rid of rootless) {
    const label = byId.get(rid)?.data.label ?? rid;
    const ext = byId.get(rid)?.data.extension ? `.${byId.get(rid)!.data.extension}` : "";
    const newRootPath = `${label}${ext}`;
    const cur = byId.get(rid);
    if (!cur) continue;
    const prevRootPath = cur.data.path;
    const idx = next.findIndex((n) => n.id === rid);
    if (idx !== -1) {
      pathChanges.push({ nodeId: rid, prevPath: prevRootPath, nextPath: newRootPath });
      next[idx] = { ...next[idx], data: { ...next[idx].data, path: newRootPath, isRoot: true } };
    }
    for (const did of getDescendants(rid, edges)) {
      const child = byId.get(did);
      const cIdx = next.findIndex((n) => n.id === did);
      if (child && child.data.path.startsWith(prevRootPath) && cIdx !== -1) {
        const newPath = child.data.path.replace(prevRootPath, newRootPath);
        pathChanges.push({ nodeId: did, prevPath: child.data.path, nextPath: newPath });
        next[cIdx] = { ...next[cIdx], data: { ...next[cIdx].data, path: newPath } };
      }
    }
  }
  return { nodes: next, pathChanges };
}
