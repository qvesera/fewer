/**
 * The feature catalogue behind the home page's hotspot playground (T-150).
 *
 * One source of truth for three views of the same story: the feature tag worn
 * by the demo graph's current card, the chip rail under it, and the tour's
 * schedule. It lives in a pure module (no React, no DOM) so the copy limits are
 * unit-testable, the way `marketingPreview.ts` is.
 *
 * No per-feature link: a card whose only action was "Try it" took the reader
 * to a docs page, which is the one thing the word "try" does not mean. The
 * card's actions are the tour, the arrows and the proof itself - which is
 * where the docs pointer belongs anyway (the hero keeps "Read the docs").
 *
 * Copy discipline is part of the contract, not a style preference: the page is
 * read in five seconds, so `line` is capped at 12 words and `headline` at 6.
 * The caps are asserted in the test rather than trusted.
 *
 * Tier honesty: the site is the free-first build (T-148 shipped the licence
 * rail off), so a feature whose MIN_TIER is `pro` must carry `tier: "pro"` and
 * render a non-interactive badge - never a purchase path that does not exist
 * (`/docs/plans` is hidden while BILLING_ENABLED is off).
 */

/** The micro-proof the callout renders. Mapped to a component in FeatureProof. */
export type ProofKind =
  | "shell"
  | "group"
  | "batch"
  | "rename"
  | "keys"
  | "layout"
  | "import"
  | "export"
  | "watch"
  | "themes"
  | "share"
  | "tags";

export interface MarketingFeature {
  /** Stable id: pins, chips and callouts key on it. */
  id: string;
  /** 1-4 words. Lives on the chip rail, so it is always visible. */
  chip: string;
  /** 1-6 words, rendered as the callout's heading. */
  headline: string;
  /** One sentence, 12 words or fewer. The whole body copy of the feature. */
  line: string;
  proof: ProofKind;
  /** A node id in PREVIEW_NODES: the card this feature is demonstrated on. */
  anchor: string;
  /**
   * The cards the feature lights up; everything else dims. Deliberately not
   * "the anchor's subtree": a hotspot anchored on the root folder would then
   * highlight the whole graph, and the point of the playground is the
   * contrast between the cards a feature touches and the rest.
   */
  on: string[];
  /** Gated feature: rendered with a Pro badge and no purchase path. */
  tier?: "pro";
}

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    id: "plan",
    chip: "Plan first",
    headline: "Plan it, then build it",
    line: "Sketch the tree, export it as a script that makes the folders.",
    proof: "shell",
    anchor: "root",
    on: ["root", "src", "docs"],
  },
  {
    id: "groups",
    chip: "Canvas groups",
    headline: "Canvas groups",
    line: "Box cards into a titled frame, then collapse it to one pill.",
    proof: "group",
    anchor: "src",
    on: ["src", "docs"],
  },
  {
    id: "batch",
    chip: "Batch actions",
    headline: "Select many, act once",
    line: "Rename, copy, cut, duplicate, move, unparent, hide or delete them together.",
    proof: "batch",
    anchor: "src",
    on: ["layout", "types", "readme", "pkg"],
  },
  {
    id: "rename",
    chip: "Wildcard rename",
    headline: "Rename the whole selection",
    line: "Find a pattern, keep what it matched, replace the rest.",
    proof: "rename",
    anchor: "layout",
    on: ["layout", "types"],
  },
  {
    id: "keyboard",
    chip: "Keyboard-first",
    headline: "Keyboard-first",
    line: "Arrow keys walk the tree; search across every card.",
    proof: "keys",
    anchor: "docs",
    on: ["docs", "doc-editing", "doc-watch", "doc-import"],
  },
  {
    id: "organize",
    chip: "Organize",
    headline: "One key re-flows the tree",
    line: "Organize re-lays it out; Crown Shyness gives branches room to breathe.",
    proof: "layout",
    anchor: "root",
    on: ["root", "src", "layout", "types", "docs", "doc-editing", "doc-watch", "doc-import", "readme", "pkg"],
  },
  {
    id: "import",
    chip: "Import anything",
    headline: "Nine ways in",
    line: "Disk, an archive, a URL, or a GitHub repo. No unpacking.",
    proof: "import",
    anchor: "root",
    on: ["root"],
  },
  {
    id: "export",
    chip: "Export in 8 formats",
    headline: "Export in 8 formats",
    line: "The .fwr document reopens exactly; the rest are for everything else.",
    proof: "export",
    anchor: "pkg",
    on: ["pkg"],
  },
  {
    id: "watch",
    chip: "Watch a URL",
    headline: "It tells you when it changes",
    line: "Watch a public index and get a daily email digest.",
    proof: "watch",
    anchor: "doc-watch",
    on: ["doc-watch"],
  },
  {
    id: "themes",
    chip: "Themes",
    headline: "Your graph, your colours",
    line: "Eighteen presets, or tune every colour yourself and share it.",
    proof: "themes",
    anchor: "readme",
    on: ["readme"],
  },
  {
    id: "share",
    chip: "Share and save",
    headline: "A link, and a way back",
    line: "Compress a small graph into the URL, or save it with history.",
    proof: "share",
    anchor: "root",
    on: ["root"],
  },
  {
    id: "tags",
    chip: "Tags",
    headline: "Colour-code any card",
    line: "Dot a card, then filter the graph to just those.",
    proof: "tags",
    anchor: "types",
    on: ["types"],
    tier: "pro",
  },
];

/** Word counts the copy test asserts against. */
export const CHIP_MAX_WORDS = 4;
export const HEADLINE_MAX_WORDS = 6;
export const LINE_MAX_WORDS = 12;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

