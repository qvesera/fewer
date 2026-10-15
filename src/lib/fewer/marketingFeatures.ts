/**
 * The feature catalogue behind the home page's chip rail and demo graph
 * (T-150, rewritten T-161 for a first-time reader).
 *
 * One source of truth for three views of the same story: the demo graph's
 * cards (a feature id IS its card id, so the canvas cannot drift from the
 * catalogue), the chip rail under it, and the tour's schedule. It lives in a
 * pure module (no React, no DOM) so the copy limits are unit-testable, the way
 * `marketingPreview.ts` is.
 *
 * Ten features, in three groups, chosen for a newcomer rather than a feature
 * list: what the folder does (see), what you can do to it (shape), and what
 * you keep (keep). `batch` and `rename` became one `edit` because they are
 * one story, and `tags` and `export` left the rail because the page has one
 * screen of room and a first-time reader has one question per group.
 *
 * The copy rule that drove T-161: a card a reader can act on is worth more
 * than a card that sounds impressive. So the words are what the app calls
 * things ("cards", never "nodes"), no jargon the product has not earned yet
 * ("Crown Shyness", "wildcard"), and a plain verb first.
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
 * (`/docs/plans` is hidden while BILLING_ENABLED is off). No feature on the
 * rail is gated today.
 */

/** The micro-proof the callout renders. Mapped to a component in FeatureProof. */
export type ProofKind =
  | "shell"
  | "group"
  | "edit"
  | "keys"
  | "layout"
  | "import"
  | "find"
  | "watch"
  | "themes"
  | "share";


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
    id: "import",
    chip: "Open anything",
    headline: "Any folder, any link",
    line: "A folder, a zip, a URL or a GitHub repo, no unpacking.",
    proof: "import",
  },
  {
    id: "search",
    chip: "Search everything",
    headline: "Find any file by name",
    line: "Jump straight to it, even the ones inside a zip.",
    proof: "find",
  },
  {
    id: "keyboard",
    chip: "Keyboard-first",
    headline: "No mouse needed",
    line: "Arrow keys walk the tree; every action has a shortcut.",
    proof: "keys",
  },
  {
    id: "plan",
    chip: "Plan ahead",
    headline: "Sketch it before you build it",
    line: "Draw the folders you want, export a script that makes them.",
    proof: "shell",
  },
  {
    id: "groups",
    chip: "Groups & notes",
    headline: "Box files into groups",
    line: "Group related files, add a note, collapse the box.",
    proof: "group",
  },
  {
    id: "edit",
    chip: "Batch edit",
    headline: "Change many at once",
    line: "Rename, move, copy or delete a whole selection together.",
    proof: "edit",
  },
  {
    id: "organize",
    chip: "Organize",
    headline: "One click re-lays it out",
    line: "The spacing dial gives crowded branches room to breathe.",
    proof: "layout",
  },
  {
    id: "share",
    chip: "Save & share",
    headline: "Come back to it anywhere",
    line: "Sign in to save across devices, or just send a link.",
    proof: "share",
  },
  {
    id: "watch",
    chip: "Watch for changes",
    headline: "It emails you when it changes",
    line: "Watch a public folder and get a daily digest.",
    proof: "watch",
  },
  {
    id: "themes",
    chip: "Themes",
    headline: "Make it yours",
    line: "Eighteen presets, or pick every colour yourself.",
    proof: "themes",
  },
];

/**
 * The three rail groups AND the demo graph's three folders - one list, so the
 * canvas tree, the `tree` pane and the chip rail can never disagree about the
 * grouping. `features` is display order; the graph derives a folder card per
 * group with a file card per feature beneath it, id = feature id.
 *
 * A category id must never be a feature id: on the graph the two would be
 * sibling cards sharing one identity, and the test pins it.
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
    id: "see",
    label: "See your files",
    tip: "Open a folder, an archive, a link or a repo, search everything inside it at once, and never reach for the mouse.",
    features: ["import", "search", "keyboard"],
  },
  {
    id: "shape",
    label: "Shape it",
    tip: "Sketch the structure first, box files into groups with a note, change a whole selection at once, and re-flow the layout.",
    features: ["plan", "groups", "edit", "organize"],
  },
  {
    id: "keep",
    label: "Keep & share",
    tip: "Save a graph and reopen it on another device, watch a public folder for changes, and recolour the canvas.",
    features: ["share", "watch", "themes"],
  },
];

/** Word counts the copy test asserts against. */
export const CHIP_MAX_WORDS = 4;
export const HEADLINE_MAX_WORDS = 6;
export const LINE_MAX_WORDS = 12;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

