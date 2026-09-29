/**
 * Leaf module (no imports on purpose) so anything can yield the main thread
 * without pulling in the import flow's dependency graph.
 */

/** Hand the main thread back for one tick so a progress bar can actually repaint.
 *  ponytail: setTimeout(0) instead of requestAnimationFrame — a macrotask is
 *  enough for paint and it keeps callers out of DOM-specific APIs. */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}