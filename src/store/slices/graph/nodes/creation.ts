// Node creation, position finding, duplicate, move.
// Split from nodes.ts — verbatim method bodies, wrapped in builder.
import { categorizeByExtension, getFileExtension } from "@/lib/fewer/categorize";
import { getDescendants } from "@/lib/fewer/validation";
import { applySearchHighlight } from "../../searchHighlight";
import { fullName } from "@/lib/fewer/nodeName";
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { edgeTypeFromStyle } from "@/lib/fewer/types";
import { sortEdges } from "@/lib/fewer/importMerge";
import type { HistoryOp } from "@/lib/fewer/types";

export function buildCreationMethods(_set: any, get: any) {
  return {
    _findFreePositionForBounds(baseX: number, baseY: number, boundsWidth: number, boundsHeight: number) {
      const { nodes, nodeWidth, nodeHeight } = get();
      const PADDING = 12;
      let x = baseX, y = baseY, attempts = 0;
      while (attempts < 50) {
        const overlapping = nodes.some((n: any) => {
          const nw = n.style?.width ?? nodeWidth;
          const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 60;
          return !(x + boundsWidth + PADDING < n.position.x || x > n.position.x + Number(nw) + PADDING || y + boundsHeight + PADDING < n.position.y || y > n.position.y + Number(nh) + PADDING);
        });
        if (!overlapping) break; x += boundsWidth + PADDING; if (x > baseX + boundsWidth * 3) { x = baseX; y += boundsHeight + PADDING; } attempts++;
      }
      return { x, y };
    },
    _findCreationPosition(baseX: number, baseY: number, boundsW: number, boundsH: number, originX: number | null, originY: number | null) {
      const { nodes, nodeWidth, nodeHeight, hiddenIds, autoHiddenIds } = get();
      const PADDING = 12;
      const hiddenSet = new Set([...hiddenIds, ...autoHiddenIds]);
      const isVisible = (n: any) => !hiddenSet.has(n.id);
      const nodeDims = (n: any) => {
        const nw = n.style?.width ?? nodeWidth;
        const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 58;
        return { nw, nh };
      };
      const aabbOverlap = (x: number, y: number, nx: number, ny: number, nw: number, nh: number) =>
        !(x + boundsW + PADDING < nx || x > nx + nw + PADDING || y + boundsH + PADDING < ny || y > ny + nh + PADDING);
      const collides = (x: number, y: number) => nodes.some((n: any) => {
        if (!isVisible(n)) return false;
        const { nw, nh } = nodeDims(n);
        return aabbOverlap(x, y, n.position.x, n.position.y, nw, nh);
      });
      if (!collides(baseX, baseY)) return { x: baseX, y: baseY };
      const hit = nodes.find((n: any) => {
        if (!isVisible(n)) return false;
        const { nw, nh } = nodeDims(n);
        return aabbOverlap(baseX, baseY, n.position.x, n.position.y, nw, nh);
      });
      if (hit) {
        const hitCx = hit.position.x + (nodeDims(hit).nw) / 2;
        const hitCy = hit.position.y + (nodeDims(hit).nh) / 2;
        const cx = baseX + boundsW / 2, cy = baseY + boundsH / 2;
        let dx = originX != null ? cx - originX : 0;
        let dy = originY != null ? cy - originY : 1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;
        for (let s = 1; s <= 15; s++) {
          const nx = baseX + dx * s * 20, ny = baseY + dy * s * 20;
          if (!collides(nx, ny)) return { x: nx, y: ny };
        }
      }
      let x = baseX, y = baseY, attempts = 0;
      while (attempts < 50) {
        if (!collides(x, y)) return { x, y };
        x += boundsW + PADDING;
        if (x > baseX + boundsW * 3) { x = baseX; y += boundsH + PADDING; }
        attempts++;
      }
      return { x, y };
    },
    addNode: (parentId: any, label: any, type: any, position?: any) => {
      const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
      const parent = nodes.find((n: any) => n.id === parentId);
      const ext = type === "file" ? getFileExtension(label) : "";
      const baseLabel = ext ? label.slice(0, -(ext.length + 1)) : label;
      const siblingIds = parentId ? edges.filter((e: any) => e.source === parentId).map((e: any) => e.target) : [];
      const siblingFullNames = new Set(nodes.filter((n: any) => siblingIds.includes(n.id)).map(fullName));
      let finalLabel = ext ? `${baseLabel}.${ext}` : baseLabel;
      if (siblingFullNames.has(finalLabel)) {
        let counter = 1;
        while (siblingFullNames.has(`${baseLabel} (${counter})${ext ? `.${ext}` : ""}`)) counter++;
        finalLabel = `${baseLabel} (${counter})${ext ? `.${ext}` : ""}`;
      }
      const newPath = parent ? `${parent.data.path}/${finalLabel}` : finalLabel;
      const nodeLabel = ext ? finalLabel.slice(0, -(ext.length + 1)) : finalLabel;
      const nh = type === "folder" ? nodeHeight : 58;
      const rawPos = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nh / 2 }
        : parent ? { x: parent.position.x + 30, y: parent.position.y + 80 } : { x: 0, y: 0 };
      const originCx = parent ? parent.position.x + nodeWidth / 2 : rawPos.x + nodeWidth / 2;
      const originCy = parent ? parent.position.y + nodeHeight / 2 : rawPos.y + nh / 2;
      const resolvedPos = position
        ? get()._findCreationPosition(rawPos.x, rawPos.y, nodeWidth, nh, originCx, originCy)
        : get()._findFreePositionForBounds(rawPos.x, rawPos.y, nodeWidth, nh);
      const newNode: FewerNode = { id: `n-new-${Date.now()}`, type, position: resolvedPos, data: { label: nodeLabel, path: newPath, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: parent ? (parent.data.depth ?? 0) + 1 : 0, isRoot: parentId === null }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
      const newEdge: { id: string; source: string; target: string; type?: string } | null = parentId ? { id: `e-${parentId}-${newNode.id}`, source: parentId, target: newNode.id, type: edgeTypeFromStyle(get().edgeStyle) } : null;
      const newEdgesUnordered = newEdge ? [...edges, newEdge] : edges;
      const newNodes = [...nodes, newNode];
      const sorted = sortEdges(newEdgesUnordered, newNodes);
      get().pushOp({ type: "add-node", node: newNode, edge: newEdge as FewerEdge | null });
      _set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), edges: sorted, graphVersion: get().graphVersion + 1 });
      const leaf = get().activeLeafId;
      if (leaf && get().viewSettings[leaf]?.positions) get().setNodePositionForLeaf(leaf, newNode.id, resolvedPos);
      return newNode.id;
    },
    addStandaloneNode: (label: any, type: any, position?: any) => {
      const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
      const trimmed = label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
      const ext = type === "file" ? getFileExtension(trimmed) : "";
      const baseLabel = ext ? trimmed.slice(0, -(ext.length + 1)) : trimmed;
      const rootNodeLabels = new Set(nodes.filter((n: any) => !edges.some((e: any) => e.target === n.id)).map(fullName));
      let finalLabel = ext ? `${baseLabel}.${ext}` : baseLabel;
      if (rootNodeLabels.has(finalLabel)) {
        let counter = 1;
        while (rootNodeLabels.has(`${baseLabel} (${counter})${ext ? `.${ext}` : ""}`)) counter++;
        finalLabel = `${baseLabel} (${counter})${ext ? `.${ext}` : ""}`;
      }
      const nodeLabel = ext ? finalLabel.slice(0, -(ext.length + 1)) : finalLabel;
      const nh = type === "folder" ? nodeHeight : 58;
      const resolvedPos = get()._findCreationPosition(position.x, position.y, nodeWidth, nh);
      const newNode: FewerNode = { id: `n-${uuid().slice(0, 8)}`, type, position: resolvedPos, data: { label: nodeLabel, path: finalLabel, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: 0, isRoot: true }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
      const newNodes = [...nodes, newNode];
      get().pushOp({ type: "add-node", node: newNode, edge: null });
      _set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
      const leaf = get().activeLeafId;
      if (leaf && get().viewSettings[leaf]?.positions) get().setNodePositionForLeaf(leaf, newNode.id, resolvedPos);
      return newNode.id;
    },
    addParentNode: (nodeId: any, label?: any, position?: any) => {
      const { nodes, edges, searchQuery, nodeWidth, nodeHeight } = get();
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) return { ok: false, reason: "Node not found." };
      const oldEdge = edges.find((e: any) => e.target === nodeId);
      const oldParent = oldEdge ? nodes.find((n: any) => n.id === oldEdge.source) : null;
      const trimmed = (label || node.data.label).trim();
      if (!trimmed) return { ok: false, reason: "Name cannot be empty." };
      const siblingIds = oldParent ? edges.filter((e: any) => e.source === oldParent.id).map((e: any) => e.target) : null;
      const siblingFullNames = siblingIds
        ? new Set(nodes.filter((n: any) => n.id !== nodeId && siblingIds.includes(n.id)).map(fullName))
        : new Set(nodes.filter((n: any) => n.id !== nodeId && !edges.some((e: any) => e.target === n.id)).map(fullName));
      if (siblingFullNames.has(trimmed)) return { ok: false, reason: `A node named "${trimmed}" already exists here.` };
      const newPath = oldParent ? `${oldParent.data.path}/${trimmed}` : trimmed;
      const edgeType = edgeTypeFromStyle(get().edgeStyle);
      const rawPos = position
        ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
        : { x: node.position.x - 40, y: node.position.y - 120 };
      const originCx = node.position.x + nodeWidth / 2;
      const originCy = node.position.y + nodeHeight / 2;
      const resolvedPos = position
        ? get()._findCreationPosition(rawPos.x, rawPos.y, nodeWidth, nodeHeight, originCx, originCy)
        : get()._findFreePositionForBounds(rawPos.x, rawPos.y, nodeWidth, nodeHeight);
      const newNode: FewerNode = {
        id: `n-${uuid().slice(0, 8)}`, type: "folder",
        position: resolvedPos,
        data: { label: trimmed, path: newPath, type: "folder", size: 0, depth: oldParent ? (oldParent.data.depth ?? 0) + 1 : 0, isRoot: !oldParent },
        style: { width: nodeWidth, height: nodeHeight, minHeight: undefined },
      };
      const parentEdge: FewerEdge | null = oldParent ? { id: `e-${oldParent.id}-${newNode.id}`, source: oldParent.id, target: newNode.id, type: edgeType } : null;
      const childEdge: FewerEdge = { id: `e-${newNode.id}-${nodeId}`, source: newNode.id, target: nodeId, type: edgeType };
      const nodeFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
      const oldChildPath = node.data.path;
      const newChildPath = `${newPath}/${nodeFullLabel}`;
      const isFolder = node.data.type === "folder";
      const descendantIds = isFolder ? getDescendants(nodeId, edges) : [];
      const changedNodeIds = [nodeId, ...descendantIds];
      const prevPaths = changedNodeIds.map((nid: any) => ({ nodeId: nid, path: nodes.find((n: any) => n.id === nid)?.data.path ?? "" })).filter((p: any) => p.path !== "");
      const nextPaths = changedNodeIds.map((nid: any) => {
        if (nid === nodeId) return { nodeId: nid, path: newChildPath };
        const d = nodes.find((n: any) => n.id === nid);
        return { nodeId: nid, path: d ? d.data.path.replace(oldChildPath, newChildPath) : "" };
      }).filter((p: any) => p.path !== "");
      const updatedNodes = nodes.map((n: any) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, path: newChildPath, isRoot: false } };
        if (descendantIds.includes(n.id) && n.data.path.startsWith(oldChildPath)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldChildPath, newChildPath) } };
        return n;
      });
      let nextEdges = oldEdge ? edges.filter((e: any) => e.id !== oldEdge.id) : edges;
      nextEdges = [...nextEdges, ...(parentEdge ? [parentEdge] : []), childEdge];
      nextEdges = sortEdges(nextEdges, [...updatedNodes, newNode]);
      const ops: HistoryOp[] = [{ type: "add-node", node: newNode, edge: parentEdge }];
      if (oldEdge) ops.push({ type: "remove-edges", edges: [oldEdge] });
      ops.push({ type: "connect", edge: childEdge, prevPaths, nextPaths });
      get().pushOp(ops);
      _set({
        nodes: applySearchHighlight([...updatedNodes, newNode], searchQuery, get().categoryFilter),
        edges: nextEdges, graphVersion: get().graphVersion + 1, selectedNodeIds: [newNode.id],
      });
      const leaf = get().activeLeafId;
      if (leaf && get().viewSettings[leaf]?.positions) get().setNodePositionForLeaf(leaf, newNode.id, resolvedPos);
      return { ok: true, id: newNode.id };
    },
    duplicateNode: (id: string, newParentId: string | null) => {
      return get().addNode(
        newParentId,
        get().nodes.find((n: any) => n.id === id)?.data.label ?? "copy",
        get().nodes.find((n: any) => n.id === id)?.data.type ?? "folder",
      );
    },
    moveNode: (id: string, newParentId: string | null) => {
      const { nodes, edges, searchQuery } = get();
      const node = nodes.find((n: any) => n.id === id);
      if (!node) return;
      const oldEdge = edges.find((e: any) => e.target === id);
      if (oldEdge && oldEdge.source === newParentId) return;
      const edgeType = edgeTypeFromStyle(get().edgeStyle);
      let nextEdges = oldEdge ? edges.filter((e: any) => e.id !== oldEdge.id) : edges;
      const newEdge: any = { id: `e-${newParentId ?? "root"}-${id}`, source: newParentId ?? "root", target: id, type: edgeType };
      nextEdges = [...nextEdges, newEdge];
      const nodeFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
      const newParent = newParentId ? nodes.find((n: any) => n.id === newParentId) : null;
      const oldPath = node.data.path;
      const newPath = newParent ? `${newParent.data.path}/${nodeFullLabel}` : nodeFullLabel;
      const isFolder = node.data.type === "folder";
      const descIds = isFolder ? getDescendants(id, edges) : [];
      const changedIds = [id, ...descIds];
      const prevPaths = changedIds.map((nid: any) => ({ nodeId: nid, path: nodes.find((n: any) => n.id === nid)?.data.path ?? "" })).filter((p: any) => p.path);
      const nextPaths = changedIds.map((nid: any) => ({ nodeId: nid, path: (nodes.find((n: any) => n.id === nid)?.data.path ?? "").replace(oldPath, newPath) })).filter((p: any) => p.path);
      const updatedNodes = nodes.map((n: any) => {
        if (n.id === id) return { ...n, data: { ...n.data, path: newPath, isRoot: !newParentId } };
        if (descIds.includes(n.id)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldPath, newPath) } };
        return n;
      });
      nextEdges = sortEdges(nextEdges, updatedNodes);
      const ops: HistoryOp[] = [];
      if (oldEdge) ops.push({ type: "remove-edges", edges: [oldEdge] });
      ops.push({ type: "connect", edge: newEdge, prevPaths, nextPaths });
      get().pushOp(ops);
      _set({
        nodes: applySearchHighlight(updatedNodes, searchQuery, get().categoryFilter),
        edges: nextEdges, graphVersion: get().graphVersion + 1,
      });
    },
  };
}
