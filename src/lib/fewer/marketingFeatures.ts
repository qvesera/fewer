/**
 * The feature catalogue behind the home page's hotspot playground (T-150).
 *
 * One source of truth for three views of the same story: the demo graph's
 * cards (a feature id IS its card id, so the canvas cannot drift from the
 * catalogue), the chip rail under it, and the tour's schedule. It lives in a
 * pure module (no React, no DOM) so the copy limits are unit-testable, the way
 * `marketingPreview.ts` is.
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
  /** Stable id: the demo graph's card, the chip and the callout key on it. */
  id: string;
  /** 1-4 words. Lives on the chip rail, so it is always visible. */
  chip: string;
  /** 1-6 words, rendered as the callout's heading. */
  headline: string;
  /** One sentence, 12 words or fewer. The whole body copy of the feature. */
  line: string;
  proof: ProofKind;
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
  },
  {
    id: "groups",
    chip: "Canvas groups",
    headline: "Canvas groups",
    line: "Box cards into a titled frame, then collapse it to one pill.",
    proof: "group",
  },
  {
    id: "batch",
    chip: "Batch actions",
    headline: "Select many, act once",
    line: "Rename, copy, cut, duplicate, move, unparent, hide or delete them together.",
    proof: "batch",
  },
  {
    id: "rename",
    chip: "Wildcard rename",
    headline: "Rename the whole selection",
    line: "Find a pattern, keep what it matched, replace the rest.",
    proof: "rename",
  },
  {
    id: "keyboard",
    chip: "Keyboard-first",
    headline: "Keyboard-first",
    line: "Arrow keys walk the tree; search across every card.",
    proof: "keys",
  },
  {
    id: "organize",
    chip: "Organize",
    headline: "One key re-flows the tree",
    line: "Organize re-lays it out; Crown Shyness gives branches room to breathe.",
    proof: "layout",
  },
  {
    id: "import",
    chip: "Import anything",
    headline: "Nine ways in",
    line: "Disk, an archive, a URL, or a GitHub repo. No unpacking.",
    proof: "import",
  },
  {
    id: "export",
    chip: "Export in 8 formats",
    headline: "Export in 8 formats",
    line: "The .fwr document reopens exactly; the rest are for everything else.",
    proof: "export",
  },
  {
    id: "watch",
    chip: "Watch a URL",
    headline: "It tells you when it changes",
    line: "Watch a public index and get a daily email digest.",
    proof: "watch",
  },
  {
    id: "themes",
    chip: "Themes",
    headline: "Your graph, your colours",
    line: "Eighteen presets, or tune every colour yourself and share it.",
    proof: "themes",
  },
  {
    id: "share",
    chip: "Share and save",
    headline: "A link, and a way back",
    line: "Compress a small graph into the URL, or save it with history.",
    proof: "share",
  },
  {
    id: "tags",
    chip: "Tags",
    headline: "Colour-code any card",
    line: "Dot a card, then filter the graph to just those.",
    proof: "tags",
    tier: "pro",
  },
];

/**
 * The three rail groups AND the demo graph's three folders - one list, so the
 * canvas tree, the `tree` pane and the chip rail can never disagree about the
 * grouping. `features` is display order; the graph derives a folder card per
 * group with a file card per feature beneath it, id = feature id.
 *
 * The third group's id is `look`, not `share`: the feature `share` already
 * owns that id, and on the graph the two would be sibling cards.
 */
export interface MarketingCategory {
  /** Stable id: the folder card's id on the demo graph. */
  id: string;
  /** 2-3 words, rendered as the rail heading and the folder card's name. */
  label: string;
  /** The hover-only sentence under the heading. */
  tip: string;
  /** Feature ids, in display order. */
  features: string[];
}

export const MARKETING_CATEGORIES: MarketingCategory[] = [
  {
    id: "arrange",
    label: "Arrange & edit",
    tip: "Sketch the structure first, box cards into groups, rename forty at once, and re-flow the layout without leaving the keyboard.",
    features: ["plan", "groups", "batch", "rename", "keyboard", "organize"],
  },
  {
    id: "connect",
    label: "Watch & connect",
    tip: "Pull a tree from disk, a URL, a repo or an archive, watch a public index for changes, and take the graph back out in eight formats.",
    features: ["import", "export", "watch"],
  },
  {
    id: "look",
    label: "Look & share",
    tip: "Recolour the canvas from a preset or by hand, share it as a link, and colour-code cards with tags.",
    features: ["themes", "share", "tags"],
  },
];

/** Word counts the copy test asserts against. */
export const CHIP_MAX_WORDS = 4;
export const HEADLINE_MAX_WORDS = 6;
export const LINE_MAX_WORDS = 12;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

