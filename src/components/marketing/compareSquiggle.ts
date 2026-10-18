/**
 * The hand-drawn compare squiggle, as single-sourced geometry (T-150
 * follow-up): these strings are copied verbatim from `public/squiggle.svg`,
 * which stays the drawing's source of record - the page inlines them because
 * the draw-on animation needs strokes CSS can reach inside an <img>.
 *
 * `compareSquiggle.test.ts` parses the public file and fails when the two
 * drift, so editing the SVG without re-copying here (or vice versa) breaks
 * `bun run test` instead of shipping a stale copy silently.
 */

/** Frame of the asset: viewBox and the layer translate, in file units. */
export const SQUIGGLE_VIEW_BOX = "0 0 70.276939 51.74147";
export const SQUIGGLE_TRANSFORM = "translate(-62.313371,-37.095952)";

/** The loop, from its free end (beside the sentence) to the arrow tip. */
export const SQUIGGLE_LOOP_PATH =
  "M 131.59032,67.002994 C 117.19474,85.130942 99.81681,94.870779 87.883466,81.979512 73.694414,66.651466 96.384728,47.399694 105.22089,64.375662 120.47625,93.68414 54.576875,91.817572 68.910101,38.650684";

/** The arrowhead, drawn a beat after the loop. */
export const SQUIGGLE_HEAD_PATH =
  "m 63.313375,42.119016 5.708767,-4.02311 3.386082,6.208957";
