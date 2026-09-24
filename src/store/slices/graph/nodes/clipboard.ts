// Clipboard operations: copy, cut, paste, duplicate.
// Split from nodes.ts per the graphSlice composer ADR.
import { getDescendants } from "@/lib/fewer/validation";
import { applySearchHighlight } from "../../searchHighlight";
import { fullName } from "@/lib/fewer/nodeName";
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { mergeImportedGraph } from "@/lib/fewer/importMerge";
import { edgeTypeFromStyle } from "@/lib/fewer/types";

export function buildClipboardMethods(_set: any, get: any) {
  return {
    clipboard: null as any,
    setClipboard: (mode: any, nodeIds: string[]) => {
      const { nodes, edges } = get();
      const allIds = new Set([...nodeIds, ...nodeIds.flatMap((id: string) => getDescendants(id, edges))]);
      const subtreeNodes = nodes.filter((n: any) => allIds.has(n.id));
      const subtreeEdges = edges.filter((e: any) => allIds.has(e.source) && allIds.has(e.target));
      _set({ clipboard: { mode, nodeIds: [...nodeIds], subtreeNodes, subtreeEdges } });
    },
    clearClipboard: () => _set({ clipboard: null }),
    _makeCopyNode: (sourceNode: any, parentId: string | null) => {
      const { nodes, edges, nodeWidth, nodeHeight } = get();
      const siblingIds = parentId ? edges.filter((e: any) => e.source === parentId).map((e: any) => e.target) : nodes.filter((n: any) => !edges.some((e: any) => e.target === n.id)).map((n: any) => n.id);
      const siblingFullNames = new Set(nodes.filter((n: any) => siblingIds.includes(n.id)).map(fullName));
      const sourceExt = sourceNode.data.extension || "";
      const baseStem = sourceNode.data.label;
      let copyFullLabel = sourceExt ? `${baseStem} copy.${sourceExt}` : `${baseStem} copy`;
      if (siblingFullNames.has(copyFullLabel)) { let counter = 2; while (siblingFullNames.has(`${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`)) counter++; copyFullLabel = `${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`; }
      const copyLabel = sourceExt ? copyFullLabel.slice(0, -(sourceExt.length + 1)) : copyFullLabel;
      const newId = `n-dup-${uuid().slice(0, 8)}`;
      return { newNode: { id: newId, type: sourceNode.type, position: { x: sourceNode.position.x + 40, y: sourceNode.position.y + 40 }, data: { ...sourceNode.data, label: copyLabel, extension: sourceNode.data.extension || "", path: parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel, isRoot: parentId === null, selected: true }, style: { ...sourceNode.style, width: nodeWidth, height: sourceNode.data.type === "folder" ? nodeHeight : undefined } } as FewerNode, newId };
    },
    _duplicateSubtree: (id: string, parentId: string | null) => {
      const { nodes, edges } = get();
      const sourceNode = nodes.find((n: any) => n.id === id);
      if (!sourceNode) return { newRoot: null as any, newNodes: [] as any[], newEdges: [] as any[] };
      const allIds = new Set([id, ...getDescendants(id, edges)]);
      const idMap = new Map<string, string>();
      for (const oid of allIds) idMap.set(oid, `n-dup-${uuid().slice(0, 8)}`);
      const siblingIds = parentId ? edges.filter((e: any) => e.source === parentId).map((e: any) => e.target) : nodes.filter((n: any) => !edges.some((e: any) => e.target === n.id)).map((n: any) => n.id);
      const siblingFullNames = new Set(nodes.filter((n: any) => siblingIds.includes(n.id)).map(fullName));
      const sourceExt = sourceNode.data.extension || "";
      const baseStem = sourceNode.data.label;
      let copyFullLabel = sourceExt ? `${baseStem} copy.${sourceExt}` : `${baseStem} copy`;
      if (siblingFullNames.has(copyFullLabel)) { let counter = 2; while (siblingFullNames.has(`${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`)) counter++; copyFullLabel = `${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`; }
      const copyLabel = sourceExt ? copyFullLabel.slice(0, -(sourceExt.length + 1)) : copyFullLabel;
      const { nodeWidth, nodeHeight } = get();
      const newNodes: any[] = [];
      for (const oid of allIds) {
        const orig = nodes.find((n: any) => n.id === oid)!;
        const nid = idMap.get(oid)!;
        const isRoot = oid === id;
        newNodes.push({ ...orig, id: nid, position: isRoot ? { x: orig.position.x + 40, y: orig.position.y + 40 } : { ...orig.position }, data: { ...orig.data, label: isRoot ? copyLabel : orig.data.label, path: isRoot ? (parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel) : orig.data.path, isRoot: isRoot && parentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
      }
      const newEdges: any[] = [];
      for (const e of edges) { if (allIds.has(e.source) && allIds.has(e.target)) { newEdges.push({ ...e, id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`, source: idMap.get(e.source)!, target: idMap.get(e.target)! }); } }
      if (parentId) newEdges.push({ id: `e-${parentId}-${idMap.get(id)}`, source: parentId, target: idMap.get(id)!, type: edgeTypeFromStyle(get().edgeStyle) });
      return { newRoot: newNodes.find((n: any) => n.id === idMap.get(id))!, newNodes, newEdges };
    },
    duplicateNodeUnderParent: (id: string) => {
      const { nodes, edges, searchQuery } = get();
      const parentId = edges.find((e: any) => e.target === id)?.source ?? null;
      const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, parentId);
      if (!newRoot) return;
      get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
      const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
      _set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
    },
    pasteNode: (id: string, parentFolderId?: string) => {
      const { nodes, edges, searchQuery } = get();
      let effectiveParentId: string | null = null;
      if (parentFolderId) { const parent = nodes.find((n: any) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
      const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, effectiveParentId);
      if (!newRoot) return;
      get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
      const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
      _set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
    },
    pasteFromClipboard: (parentFolderId?: string) => {
      const clip = get().clipboard;
      if (!clip || clip.nodeIds.length === 0) return;
      const { pastePosition, mousePosition, nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
      const effectivePastePos = pastePosition ?? mousePosition;
      let effectiveParentId: string | null = null;
      if (parentFolderId) { const parent = nodes.find((n: any) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
      const { subtreeNodes, subtreeEdges } = clip;
      const allIds = new Set<string>(subtreeNodes.map((n: any) => n.id));
      const rootIds = (clip.nodeIds as unknown as string[]).filter((id) => allIds.has(id));
      const idMap = new Map<string, string>();
      for (const oid of allIds) idMap.set(oid, `n-paste-${uuid().slice(0, 8)}`);
      const newNodes: any[] = [];
      const rootOrig = subtreeNodes.find((n: any) => rootIds.includes(n.id));
      const minX = Math.min(...subtreeNodes.map((n: any) => n.position.x));
      const minY = Math.min(...subtreeNodes.map((n: any) => n.position.y));
      const maxX = Math.max(...subtreeNodes.map((n: any) => n.position.x + Number(n.style?.width ?? nodeWidth)));
      const maxY = Math.max(...subtreeNodes.map((n: any) => n.position.y + Number(n.style?.height ?? 60)));
      const boundsW = maxX - minX; const boundsH = maxY - minY;
      const defaultBase = rootOrig ? { x: rootOrig.position.x + 40, y: rootOrig.position.y + 40 } : { x: 0, y: 0 };
      const tryBase = effectivePastePos ? effectivePastePos : defaultBase;
      const rootBase = rootOrig ? get()._findFreePositionForBounds(tryBase.x, tryBase.y, boundsW, boundsH) : { x: 0, y: 0 };
      const rootDelta = rootOrig ? { x: rootBase.x - rootOrig.position.x, y: rootBase.y - rootOrig.position.y } : { x: 0, y: 0 };
      for (const orig of subtreeNodes) {
        const nid = idMap.get(orig.id)!;
        const isRoot = rootIds.includes(orig.id);
        let copyLabel = orig.data.label;
        if (isRoot) {
          const stem = orig.data.label;
          const origExt = orig.data.extension || "";
          const origFull = origExt ? `${stem}.${origExt}` : stem;
          const parentSiblingIds = effectiveParentId ? edges.filter((e: any) => e.source === effectiveParentId).map((e: any) => e.target) : nodes.filter((n: any) => !edges.some((e: any) => e.target === n.id)).map((n: any) => n.id);
          const parentSiblingFullNames = new Set(nodes.filter((n: any) => parentSiblingIds.includes(n.id)).map(fullName));
          if (parentSiblingFullNames.has(origFull)) { let cl = `${stem} copy`; let clFull = origExt ? `${cl}.${origExt}` : cl; if (parentSiblingFullNames.has(clFull)) { let counter = 2; while (parentSiblingFullNames.has(`${stem} copy ${counter}${origExt ? `.${origExt}` : ""}`)) counter++; cl = `${stem} copy ${counter}`; } copyLabel = cl; }
        }
        const pos = isRoot ? rootBase : { x: orig.position.x + rootDelta.x, y: orig.position.y + rootDelta.y };
        newNodes.push({ ...orig, id: nid, position: pos, data: { ...orig.data, label: copyLabel, path: isRoot ? copyLabel : orig.data.path, isRoot: isRoot && effectiveParentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
      }
      const newEdges: any[] = [];
      for (const e of subtreeEdges) { if (allIds.has(e.source) && allIds.has(e.target)) { const ns = idMap.get(e.source)!; const nt = idMap.get(e.target)!; if (ns && nt) newEdges.push({ ...e, id: `e-${ns}-${nt}-${uuid().slice(0, 6)}`, source: ns, target: nt }); } }
      if (effectiveParentId) {
        const parentNode = nodes.find((n: any) => n.id === effectiveParentId);
        const parentPath = parentNode?.data.path ?? "";
        for (const rootId of rootIds) {
          const newId = idMap.get(rootId);
          if (!newId) continue;
          newEdges.push({ id: `e-${effectiveParentId}-${newId}`, source: effectiveParentId, target: newId, type: edgeTypeFromStyle(get().edgeStyle) });
          const pastedNode = newNodes.find((n: any) => n.id === newId);
          if (pastedNode) {
            const fullLabel = pastedNode.data.extension ? `${pastedNode.data.label}.${pastedNode.data.extension}` : pastedNode.data.label;
            pastedNode.data.path = `${parentPath}/${fullLabel}`;
            pastedNode.data.isRoot = false;
          }
        }
      }
      get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
      const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
      _set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: rootIds.map((id) => idMap.get(id)!), pastePosition: null, graphVersion: get().graphVersion + 1 });
    },
  };
}
