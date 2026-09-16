import type { FewerEdge, FewerNode } from "./types";

/** Preserve painter order: files before folders, reverse label, then raised edges. */
export function sortEdges(edges: FewerEdge[], nodes: FewerNode[]): FewerEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return [...edges].sort((a, b) => {
    const aNode = nodeMap.get(a.target);
    const bNode = nodeMap.get(b.target);
    const aType = aNode?.data.type ?? "file";
    const bType = bNode?.data.type ?? "file";
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    const aLabel = aNode?.data.label ?? "";
    const bLabel = bNode?.data.label ?? "";
    const labelDiff = bLabel.localeCompare(aLabel);
    if (labelDiff !== 0) return labelDiff;
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
}

/** Shared duplicate/paste merge; history and search highlighting stay in the slice. */
export function mergeImportedGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  newNodes: FewerNode[],
  newEdges: FewerEdge[],
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const mergedNodes = [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes];
  return { nodes: mergedNodes, edges: sortEdges([...edges, ...newEdges], mergedNodes) };
}
