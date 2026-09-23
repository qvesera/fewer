/**
 * Pure helpers for sidebar section reorder animation (FLIP).
 * DOM-free; testable with bun test.
 *
 * The ease curve matches CollapsibleSection's grid-rows animation
 * (globals.css ease-[cubic-bezier(0.16,1,0.3,1)]).
 */

export const REORDER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const REORDER_DURATION_MS = 180;

export interface FlipOffset {
  id: string;
  dy: number;
}

/**
 * Diff before/after top-of-rect maps and return the deltas to animate.
 * Skips: ids missing on either side, sub-pixel moves, and everything
 * when reduced motion is requested.
 */
export function computeFlipOffsets(
  prev: Map<string, number>,
  next: Map<string, number>,
  opts?: { reducedMotion?: boolean; minDeltaPx?: number },
): FlipOffset[] {
  if (opts?.reducedMotion) return [];
  const minDelta = opts?.minDeltaPx ?? 1;
  const out: FlipOffset[] = [];
  for (const [id, nextTop] of next) {
    const prevTop = prev.get(id);
    if (prevTop === undefined) continue; // newly mounted
    const dy = prevTop - nextTop;
    if (Math.abs(dy) < minDelta) continue;
    out.push({ id, dy });
  }
  return out;
}
