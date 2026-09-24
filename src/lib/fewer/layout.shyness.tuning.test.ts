import { expect, test } from "bun:test";
import { SAMPLE_TREE } from "./sampleData";
import { treeToGraph } from "./treeToGraph";
import { layoutGraphSync } from "./layout";
import type { FewerEdge, FewerNode, TreeEntry } from "./types";

/**
 * Crown Shyness tuning harness + regression guard.
 *
 * The coefficients in layout.ts (SHYNESS_DEPTH_K / SHYNESS_SIZE_K) are full
 * strength values, and effectiveShynessScale maps the slider value onto a
 * fraction of them with a cubic response that tops out at SHYNESS_TOP (8/9 —
 * the strength 2x produced before the top of the dial was capped). They were
 * raised from 8/2 (cap 3x) to 40/70 (cap 20x) because the old pair moved a wide
 * flat project by ~2% end to end — below the threshold of noticing, which is the
 * "0 and 3 look the same" report.
 *
 * Re-run this before changing those constants: it prints the full sweep and
 * asserts the shape the docs promise. Measured at the time of writing:
 *   sample  TB: 0->1  +1%, 0->2  +8%, 0->3  +28%
 *   sample  LR: 0->1  +3%, 0->2 +21%, 0->3  +71%
 *   large   TB: 0->1  +1%, 0->2 +11%, 0->3  +36%
 *   large   LR: 0->1  +4%, 0->2 +30%, 0->3 +100%
 * Thresholds are deliberately slack so unrelated layout tweaks don't trip them;
 * they exist to catch a coefficient regression back to "invisible", and — for
 * the default — a regression back to a layout that no longer fits the canvas.
 */

const NW = 240;
const NH = 120;

function style(nodes: FewerNode[]): FewerNode[] {
  return nodes.map((n) => ({
    ...n,
    style: { ...n.style, width: NW, height: n.data.type === "folder" ? NH : undefined },
  })) as FewerNode[];
}

/** Spread along the sibling axis: x for TB/BT, y for LR/RL. */
function span(laid: FewerNode[], dir: string): number {
  const primary = laid.map((n) => (dir === "TB" || dir === "BT" ? n.position.x : n.position.y));
  return Math.round(Math.max(...primary) - Math.min(...primary));
}

/** Spreads for scales 0,1,2,3, plus the growth from 0 to `upto`. */
function sweep(tree: TreeEntry, idPrefix: string, dir: "TB" | "LR", prints: string) {
  const g = treeToGraph(tree, { idPrefix }) as unknown as { nodes: FewerNode[]; edges: FewerEdge[] };
  const nodes = style(g.nodes);
  const spans = [0, 1, 2, 3].map((s) => span(layoutGraphSync(nodes, g.edges, dir, { shynessScale: s }), dir));
  const pct = (a: number, b: number) => Math.round((b / a - 1) * 100);
  console.log(
    `SHYNESS ${prints} ${dir}: 0x=${spans[0]} 1x=${spans[1]} 2x=${spans[2]} 3x=${spans[3]}` +
      ` | 0->1 ${pct(spans[0], spans[1])}% 0->2 ${pct(spans[0], spans[2])}% 0->3 ${pct(spans[0], spans[3])}%`,
  );
  return spans;
}

/** A wide, flat project: 5 branches of 3 levels with 4 children each (~1.7K nodes). */
function largeTree(): TreeEntry {
  let c = 0;
  const file = (): TreeEntry => ({ name: `f${c++}.ts`, type: "file", size: 10 });
  const folder = (depth: number, fan: number): TreeEntry => ({
    name: `d${c++}`,
    type: "folder",
    children: depth === 0 ? Array.from({ length: fan }, file) : Array.from({ length: fan }, () => folder(depth - 1, fan)),
  });
  return { name: "root", type: "folder", children: Array.from({ length: 5 }, () => folder(3, 4)) };
}

test("shyness sweep: every step widens the sample tree, default 1x stays modest", () => {
  for (const dir of ["TB", "LR"] as const) {
    const spans = sweep(SAMPLE_TREE, "sample", dir, "sample");
    // Monotonic: the slider never goes backwards on any step.
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]).toBeGreaterThan(spans[i - 1]);
    }
    // 0 -> 3 must be an obvious re-flow, not a 2% nudge. The top of the dial is
    // capped at SHYNESS_TOP, so 3x now lands where 2x used to: +28% (TB) / +71%
    // (LR) on the sample tree, in place of +94% / +240%.
    const grow3 = spans[3] / spans[0] - 1;
    expect(grow3).toBeGreaterThan(dir === "TB" ? 0.2 : 0.5);
    // ...while the default (1x) stays modest. It must differ from "off", but the
    // initial fit clamps at zoom 0.35, so a fat default pushes the far side of
    // the tree outside the viewport, where onlyRenderVisibleElements culls it —
    // that is what a linear response did (1x went to +80% LR and the e2e suite
    // lost nodes on the initial view). The slider's range lives at the top end.
    const grow1 = spans[1] / spans[0] - 1;
    expect(grow1).toBeGreaterThan(0);
    expect(grow1).toBeLessThan(0.15);
  }
});

test("shyness sweep: a 1.7K-node tree stays proportional, not explosive", () => {
  const tree = largeTree();
  for (const dir of ["TB", "LR"] as const) {
    const spans = sweep(tree, "big", dir, "large");
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]).toBeGreaterThan(spans[i - 1]);
    }
    for (const s of [1, 2, 3]) {
      expect(spans[s]).toBeGreaterThan(spans[0]);
    }
    // The top of the slider does the work: 3x is a far bigger step than 1x, so a
    // linear response cannot creep back in unnoticed.
    expect(spans[3] - spans[0]).toBeGreaterThan(4 * (spans[1] - spans[0]));
    // Bounded by SHYNESS_MAX_MULTIPLE so a big tree cannot run away: the same
    // order of growth as the sample tree, not a multiplicative blow-up.
    expect(spans[3] / spans[0]).toBeLessThan(5);
  }
});
