import type { FewerNode, FileCategory } from "@/lib/fewer/types";

/**
 * Highlight nodes whose label or extension matches `query`, dimming the rest.
 * An empty query clears all highlight/dim flags.
 *
 * Copy-on-write (T-219): the old version `map`ed EVERY node into a fresh
 * `{...n, data: {...n.data, highlighted: false, dimmed: false}}` on every call —
 * 50k node + 50k data allocations per progressive batch, per relayout, per any
 * structural edit, even when the query was empty and the flags were already
 * false. Now:
 *   - empty query + nothing to clear  → the SAME array reference (zero alloc);
 *   - empty query + some flagged     → same array, only flagged nodes cloned;
 *   - non-empty query                → only nodes whose flags actually flip are
 *                                       cloned; already-correct nodes keep
 *                                       their identity, so React Flow skips
 *                                       re-adopting them.
 *
 * ponytail: `categoryFilter` is accepted but unused — kept so every call site
 * keeps its shape. Upgrade path: category-aware matching when needed.
 */
export function applySearchHighlight(
  nodes: FewerNode[],
  query: string,
  _categoryFilter?: FileCategory[],
): FewerNode[] {
  const trimmed = query.trim();
  if (!trimmed) {
    // No query: clear flags, but only where they are set. Zero allocations when
    // the graph is already clean (the common case: every batch/relayout call).
    let out: FewerNode[] | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const d = nodes[i].data;
      if (!d.highlighted && !d.dimmed) continue;
      if (!out) out = nodes.slice();
      out[i] = { ...nodes[i], data: { ...d, highlighted: false, dimmed: false } };
    }
    return out ?? nodes;
  }
  const q = trimmed.toLowerCase();
  let out: FewerNode[] | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const matches =
      n.data.label.toLowerCase().includes(q) ||
      (n.data.extension ?? "").toLowerCase().includes(q);
    const wantHighlight = matches;
    const wantDimmed = !matches;
    if (n.data.highlighted === wantHighlight && n.data.dimmed === wantDimmed) continue;
    if (!out) out = nodes.slice();
    out[i] = { ...n, data: { ...n.data, highlighted: wantHighlight, dimmed: wantDimmed } };
  }
  return out ?? nodes;
}
