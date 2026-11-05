"use client";

import { useEffect, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { getParent } from "@/lib/fewer/navigation";
import { describeNode } from "@/lib/fewer/a11yDescribe";
import type { FewerEdge } from "@/lib/fewer/types";

/** How many edges up from the card to the root (0 = top level). Bounded by the
 *  nodes it has seen, so a malformed cyclic graph cannot hang the announcer. */
function depthOf(id: string, edges: FewerEdge[]): number {
  let depth = 0;
  let cursor: string | null = id;
  const seen = new Set<string>([id]);
  while (cursor !== null) {
    const parent: string | null = getParent(cursor, edges);
    if (parent === null || seen.has(parent)) break;
    seen.add(parent);
    cursor = parent;
    depth++;
  }
  return depth;
}

/**
 * The canvas's voice (T-215 / #514): an sr-only polite region that speaks
 * whenever the selection moves, so arrow-key navigation is usable without
 * eyes. Polite, not assertive — it queues behind whatever is being read, which
 * is right for navigation that can fire several times a second. Multi-select
 * announces a count instead of one card, because only one is true.
 */
export function CanvasLiveRegion() {
  const selected = useGraphStore((s) => s.selectedNodeIds);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selected.length === 0) {
      setMessage("");
      return;
    }
    if (selected.length > 1) {
      setMessage(`${selected.length} cards selected`);
      return;
    }
    // Read the graph fresh instead of subscribing to it: a drag would otherwise
    // re-announce the same card on every frame.
    const { nodes, edges, tags } = useGraphStore.getState();
    const node = nodes.find((n) => n.id === selected[0]);
    if (!node) {
      setMessage("");
      return;
    }
    const tagNames = (node.data.tagIds ?? [])
      .map((id) => tags.find((t) => t.id === id)?.label ?? "")
      .filter(Boolean);
    const childCount = edges.filter((e) => e.source === node.id).length;
    setMessage(
      describeNode(node, { childCount, depth: depthOf(node.id, edges), tagNames }),
    );
  }, [selected]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
