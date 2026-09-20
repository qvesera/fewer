// Node deletion.
// Split from nodes.ts per the graphSlice composer ADR.
import { getDescendants } from "@/lib/fewer/validation";
import { captureViewState } from "../../historySlice";
import { applySearchHighlight } from "../../searchHighlight";

export function buildDeletionMethods(_set: any, get: any) {
  return {
    deleteNodes: (ids: string[]) => {
      const { nodes, edges, searchQuery } = get();
      const toRemove = new Set([...ids, ...ids.flatMap((id: string) => getDescendants(id, edges))]);
      const removedNodes = nodes.filter((n: any) => toRemove.has(n.id));
      const removedEdges = edges.filter((e: any) => toRemove.has(e.source) && toRemove.has(e.target));
      const newNodes = nodes.filter((n: any) => !toRemove.has(n.id));
      const newEdges = edges.filter((e: any) => !toRemove.has(e.source) && !toRemove.has(e.target));
      if (removedNodes.length > 0) {
        const rootEdge = edges.find((e: any) => e.target === ids[0]) ?? null;
        const before = captureViewState(get());
        const after = { ...before, hiddenIds: before.hiddenIds.filter((h: string) => !toRemove.has(h)) };
        get().pushOp({ type: "remove-subtree", node: removedNodes[0], edge: rootEdge, children: removedNodes.slice(1), childEdges: removedEdges, before, after });
      }
      _set((s: any) => ({
        nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter),
        edges: newEdges,
        selectedNodeIds: [],
        hiddenIds: s.hiddenIds.filter((h: string) => !toRemove.has(h)),
        autoHiddenIds: s.autoHiddenIds.filter((h: string) => !toRemove.has(h)),
        revealedRootIds: s.revealedRootIds.filter((h: string) => !toRemove.has(h)),
        independentlyHiddenIds: s.independentlyHiddenIds.filter((h: string) => !toRemove.has(h)),
        graphVersion: s.graphVersion + 1,
      }));
    },
  };
}
