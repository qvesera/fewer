import type { FewerNode, FileCategory } from "@/lib/fewer/types";

/**
 * Highlight nodes whose label or extension matches `query`, dimming the rest.
 * An empty query clears all highlight/dim flags.
 *
 * ponytail: `categoryFilter` is accepted but unused — kept so every call site
 * keeps its shape. Upgrade path: category-aware matching when needed.
 */
export function applySearchHighlight(
  nodes: FewerNode[],
  query: string,
  _categoryFilter?: FileCategory[],
): FewerNode[] {
  if (!query.trim()) {
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    }));
  }
  const q = query.toLowerCase();
  return nodes.map((n) => {
    const matches =
      n.data.label.toLowerCase().includes(q) ||
      (n.data.extension ?? "").toLowerCase().includes(q);
    return {
      ...n,
      data: { ...n.data, highlighted: matches, dimmed: !matches },
    };
  });
}
