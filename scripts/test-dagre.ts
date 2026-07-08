// Quick test of the layout function in isolation
import dagre from "@dagrejs/dagre";

const nodes = [
  { id: "a", position: { x: 0, y: 0 } },
  { id: "b", position: { x: 0, y: 0 } },
  { id: "c", position: { x: 0, y: 0 } },
  { id: "d", position: { x: 0, y: 0 } },
];
const edges = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
g.setGraph({
  rankdir: "TB",
  nodesep: 36,
  ranksep: 80,
  marginx: 24,
  marginy: 24,
  ranker: "tight-tree",
});
g.setDefaultEdgeLabel(() => ({}));

for (const n of nodes) {
  g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
}
for (const e of edges) {
  if (g.hasNode(e.source) && g.hasNode(e.target)) {
    g.setEdge(e.source, e.target);
  }
}

console.log("Before layout:");
for (const id of g.nodes()) {
  console.log(" ", id, JSON.stringify(g.node(id)));
}

dagre.layout(g);

console.log("\nAfter layout:");
for (const id of g.nodes()) {
  console.log(" ", id, JSON.stringify(g.node(id)));
}

console.log("\nDefault export type:", typeof dagre);
console.log("graphlib type:", typeof dagre.graphlib);
console.log("layout fn type:", typeof dagre.layout);
