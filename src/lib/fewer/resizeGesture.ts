import type { FewerNode } from "./types";

export type Dims = { w: number; h: number };

/**
 * Id of the node whose NodeResizer handle is currently under the pointer, or
 * null. Only folder cards render a NodeResizer, so a file card can never arm
 * this — which is exactly why it is the gate: React Flow re-measures a card
 * whenever its CONTENT changes (renaming to a longer label wraps it onto
 * another line), and those measurements must not be mistaken for a resize.
 *
 * ponytail: one module-level slot instead of store state — a resize is a single
 * pointer gesture, nothing renders off this value, and NodeResizer has no
 * concurrent multi-node mode.
 */
let activeId: string | null = null;

/** Called from NodeResizer's onResizeStart (pointer down on a folder handle). */
export function beginResizeGesture(nodeId: string): void {
  activeId = nodeId;
}

/** Called from NodeResizer's onResizeEnd. */
export function endResizeGesture(): void {
  activeId = null;
}

/** Is this dimension change part of a real resize gesture by the user? */
export function isResizeGestureFor(nodeId: string): boolean {
  return activeId === nodeId;
}

/** Size a node should be pinned to: explicit style first, last measurement else. */
export function nodeDims(n: FewerNode): Dims {
  return {
    w: (n.style?.width as number) ?? n.measured?.width ?? 0,
    h: (n.style?.height as number) ?? n.measured?.height ?? 0,
  };
}

/**
 * Resize ops for the dimension captures taken during a gesture, or [] when
 * nothing actually changed.
 *
 * BOTH ends go through `nodeDims`, so a file card — which deliberately carries
 * no `style.height` (only folders pin a height) — can never be recorded as
 * "resize to height 0". That zero used to be replayed by redo, painting the
 * card 0px tall: still in the graph, invisible on the canvas.
 */
export function pendingResizeOps(
  nodes: FewerNode[],
  starts: ReadonlyMap<string, Dims>,
): { nodeId: string; from: Dims; to: Dims }[] {
  if (starts.size === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out: { nodeId: string; from: Dims; to: Dims }[] = [];
  for (const [nodeId, from] of starts) {
    const node = byId.get(nodeId);
    if (!node) continue;
    const to = nodeDims(node);
    if (from.w !== to.w || from.h !== to.h) out.push({ nodeId, from, to });
  }
  return out;
}