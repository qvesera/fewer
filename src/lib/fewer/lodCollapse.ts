/**
 * LOD folder collapse (ported from fewer-desktop's T-267, this repo's T-250):
 * below this zoom every folder card drops its child rows and renders the same
 * one-line pill a user-collapsed folder shows, so a zoomed-out canvas reads as
 * plain cards instead of nested lists — the rows are unreadable at that scale
 * anyway, and sorting them per card was real work thrown away on every frame.
 *
 * 0.3 matches desktop exactly. Desktop's band argument (don't collapse above
 * its 0.35 dot tier, where everything is still legible) doesn't apply here —
 * web has no dot/chip tier — so this number is a starting point to re-tune
 * from `bun run perf:bench` measurements, not a contract. Strict: zoom < 0.3
 * collapses.
 */
export const LOD_FOLDER_COLLAPSE_ZOOM = 0.3;
