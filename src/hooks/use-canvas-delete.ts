import { useCallback } from "react";
import type { Edge, Node } from "@xyflow/react";

type ToastFn = (opts: { title: string; description?: string }) => void;

interface DeleteDeps {
  deleteNodes: (ids: string[]) => void;
  deleteEdges: (ids: string[]) => void;
  toast: ToastFn;
}

/** Build toast payloads for a batch deletion. */
export function deleteToastPayloads(
  nodes: Node[],
  edges: Edge[],
): { title: string; description: string }[] {
  const out: { title: string; description: string }[] = [];
  if (nodes.length > 0) {
    out.push({
      title: "Deleted",
      description: `${nodes.length} item${nodes.length === 1 ? "" : "s"} removed`,
    });
  }
  if (edges.length > 0) {
    out.push({
      title: "Deleted",
      description: `${edges.length} edge${edges.length === 1 ? "" : "s"} removed`,
    });
  }
  return out;
}

/**
 * React Flow onDelete callback: delete nodes/edges and show toast for each.
 */
export function useCanvasDelete({ deleteNodes, deleteEdges, toast }: DeleteDeps) {
  return useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (deletedNodes.length > 0) {
        deleteNodes(deletedNodes.map((n) => n.id));
      }
      if (deletedEdges.length > 0) {
        deleteEdges(deletedEdges.map((e) => e.id));
      }
      for (const msg of deleteToastPayloads(deletedNodes, deletedEdges)) {
        toast(msg);
      }
    },
    [deleteNodes, deleteEdges, toast],
  );
}
