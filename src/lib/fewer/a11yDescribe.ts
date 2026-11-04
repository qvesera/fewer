import type { FewerNode } from "./types";

/**
 * The sentence a screen reader hears when the canvas selection moves
 * (T-215 / #514). Name first — that is what a non-visual reader scans — then
 * the kind, position in the tree, size, tags, and the flags that change what
 * the next keystroke will do. Kept pure: the component that owns the live
 * region resolves child counts, depth and tag names from the store and passes
 * them in, so this string is unit-testable without a DOM.
 */
export function describeNode(
  n: FewerNode,
  opts: {
    childCount: number;
    depth: number;
    tagNames: string[];
    hiddenChildCount?: number;
  },
): string {
  const data = n.data;
  const parts: string[] = [data.label, data.type];

  parts.push(opts.depth === 0 ? "top level" : `level ${opts.depth + 1}`);

  if (data.type === "folder") {
    parts.push(opts.childCount === 0 ? "no children" : `${opts.childCount} ${opts.childCount === 1 ? "child" : "children"}`);
    if (opts.hiddenChildCount) {
      parts.push(`${opts.hiddenChildCount} hidden`);
    }
  }
  if (data.isRoot) parts.push("root card");
  if (opts.tagNames.length > 0) parts.push(`tags ${opts.tagNames.join(", ")}`);
  if (data.dimmed) parts.push("not matched, dimmed");
  if (n.data.collapsed) parts.push("collapsed");

  return parts.join(", ");
}
