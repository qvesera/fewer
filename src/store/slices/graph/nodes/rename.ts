// Node rename (single + batch).
// Split from nodes.ts — verbatim method bodies.
import { categorizeByExtension, getFileExtension } from "@/lib/fewer/categorize";
import { getDescendants } from "@/lib/fewer/validation";
import { applySearchHighlight } from "../../searchHighlight";

export function buildRenameMethods(_set: any, get: any) {
  return {
    renameNode: (id: any, newLabel: any) => {
      const { nodes, edges, searchQuery } = get();
      const trimmed = newLabel.trim();
      if (!trimmed) return false;
      const node = nodes.find((n: any) => n.id === id);
      if (!node) return false;
      const oldLabel = node.data.label;
      const newExt = node.data.type === "file" ? getFileExtension(trimmed) : "";
      const newLabelOnly = newExt ? trimmed.slice(0, -(newExt.length + 1)) : trimmed;
      const oldFull = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
      const newFull = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
      if (newFull.toLowerCase() === oldFull.toLowerCase()) { _set({ renamingId: null }); return false; }
      const parentEdge = edges.find((e: any) => e.target === id);
      const parent = parentEdge ? nodes.find((n: any) => n.id === parentEdge.source) : null;
      const sibIds = parentEdge
        ? edges.filter((e: any) => e.source === parentEdge.source && e.target !== id).map((e: any) => e.target)
        : nodes.filter((n: any) => !edges.some((e: any) => e.target === n.id) && n.id !== id).map((n: any) => n.id);
      const clash = sibIds.some((sid: any) => {
        const s = nodes.find((n: any) => n.id === sid);
        if (!s) return false;
        const sFull = s.data.extension ? `${s.data.label}.${s.data.extension}` : s.data.label;
        return sFull.toLowerCase() === newFull.toLowerCase();
      });
      if (clash) { _set({ renamingId: null }); return false; }
      const parentPath = parent ? parent.data.path : "";
      const oldPrefix = parent ? `${parentPath}/${oldFull}` : oldFull;
      const newPrefix = parent ? `${parentPath}/${newFull}` : newFull;
      const isFolder = node.data.type === "folder";
      const descIds = new Set(isFolder ? getDescendants(id, edges) : []);
      const newNodes = nodes.map((n: any) => {
        if (n.id === id) return { ...n, data: { ...n.data, label: newLabelOnly, path: newPrefix, extension: newExt, category: newExt ? categorizeByExtension(newExt) : undefined } };
        if (isFolder && descIds.has(n.id) && n.data.path.startsWith(oldPrefix)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldPrefix, newPrefix) } };
        return n;
      });
      get().pushOp({ type: "rename", nodeId: id, oldLabel, newLabel: newLabelOnly });
      _set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), renamingId: null, graphVersion: get().graphVersion + 1 });
      return true;
    },
    renameNodes: (ids: any, transform: any) => {
      const { nodes, edges, searchQuery } = get();
      let nextNodes = nodes;
      const ops: any[] = [];
      ids.forEach((id: any, index: number) => {
        const node = nextNodes.find((n: any) => n.id === id);
        if (!node) return;
        const raw = transform(node, index);
        const trimmed = typeof raw === "string" ? raw.trim() : "";
        if (!trimmed) return;
        const newExt = node.data.type === "file" ? getFileExtension(trimmed) : "";
        const newLabelOnly = newExt ? trimmed.slice(0, -(newExt.length + 1)) : trimmed;
        const oldFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
        const newFullLabel = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
        if (newFullLabel.toLowerCase() === oldFullLabel.toLowerCase()) return;
        const parentEdge = edges.find((e: any) => e.target === id);
        const parent = parentEdge ? nodes.find((n: any) => n.id === parentEdge.source) : null;
        const sibIds = parentEdge
          ? edges.filter((e: any) => e.source === parentEdge.source && e.target !== id).map((e: any) => e.target)
          : nextNodes.filter((n: any) => !edges.some((e: any) => e.target === n.id) && n.id !== id).map((n: any) => n.id);
        const clash = sibIds.some((sid: any) => {
          const s = nextNodes.find((n: any) => n.id === sid);
          if (!s) return false;
          const sFull = s.data.extension ? `${s.data.label}.${s.data.extension}` : s.data.label;
          return sFull.toLowerCase() === newFullLabel.toLowerCase();
        });
        if (clash) return;
        const parentPath = parent ? parent.data.path : "";
        const oldPrefix = parent ? `${parentPath}/${oldFullLabel}` : oldFullLabel;
        const newPrefix = parent ? `${parentPath}/${newFullLabel}` : newFullLabel;
        const isFolder = node.data.type === "folder";
        const descIds = new Set(isFolder ? getDescendants(id, edges) : []);
        nextNodes = nextNodes.map((n: any) => {
          if (n.id === id) return { ...n, data: { ...n.data, label: newLabelOnly, path: newPrefix, extension: newExt, category: newExt ? categorizeByExtension(newExt) : undefined } };
          if (isFolder && descIds.has(n.id) && n.data.path.startsWith(oldPrefix)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldPrefix, newPrefix) } };
          return n;
        });
        ops.push({ type: "rename", nodeId: id, oldLabel: node.data.label, newLabel: newLabelOnly });
      });
      if (ops.length === 0) { _set({ renamingId: null }); return 0; }
      get().pushOp(ops);
      _set({ nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter), renamingId: null, graphVersion: get().graphVersion + 1 });
      return ops.length;
    },
  };
}
