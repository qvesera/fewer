/**
 * The home page's hero promise (T-161, follow-up).
 *
 * Four messages, one slot: the page opens on the first one and rotates on its
 * own, so the reader who does nothing still sees all four. `HeroRotator.tsx`
 * owns the behaviour; this module owns the copy, in a pure file so the limits
 * are unit-testable the same way `marketingFeatures.ts` is.
 *
 * The audience rule for this copy: a newcomer who does not want a graph. No
 * slide may mention one - the word "graph" now lives in the metadata, the
 * section lead-in and the docs, where a reader who already knows what they
 * want can find it. The five slides are the five jobs the product does: see
 * everything, find one thing, understand a folder, fix a mess, and watch a
 * folder for changes.
 *
 * Copy discipline is part of the contract: kicker <= 6 words, headline <= 8,
 * line <= 20, no em dashes (the house style since T-149), and no two slides
 * may repeat a headline. The caps are asserted, not trusted.
 */

import { wordCount } from "./marketingFeatures";

export interface HeroSlide {
  /** Stable id: the slide node, its dot button and the tests key on it. */
  id: string;
  /** Small mono kicker above the headline. <= 6 words. */
  kicker: string;
  /** The heading. <= 8 words, and never a graph or map word (see the test). */
  headline: string;
  /** One sentence. <= 20 words. */
  line: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "see",
    kicker: "For anyone with too many folders",
    headline: "See everything in your folders at once",
    line: "Open a folder and everything inside appears on one screen. Search it, tidy it up, take what you need.",
  },
  {
    id: "find",
    kicker: "Stop hunting through folders",
    headline: "Find any file, however deep it is",
    line: "Open a folder and search everything inside at once, including files still zipped up.",
  },
  {
    id: "understand",
    kicker: "New project, or an inherited folder?",
    headline: "Understand any folder in seconds",
    line: "See how everything fits together, instead of opening folders one by one and losing the thread.",
  },
  {
    id: "fix",
    kicker: "Your files, finally in order",
    headline: "Take control of a messy folder",
    line: "See it all at once, then rename, group, move or delete in bulk. Nothing gets unpacked.",
  },
  {
    id: "watch",
    kicker: "Keep an eye on a folder",
    headline: "Get told when a folder changes",
    line: "Point it at a public folder and we email you when something is added or removed.",
  },
];

/** The trust line, which never rotates: a promise that changes is not one. */
export const HERO_TRUST_LINE = "Runs in your browser. Your files never leave your device.";

export const KICKER_MAX_WORDS = 6;
export const HEADLINE_MAX_WORDS = 8;
export const LINE_MAX_WORDS = 20;

/**
 * How long a message holds, and how long the dot under it drains for. One
 * constant feeding both - the countdown reads it as a CSS custom property, so
 * the bar and the clock cannot disagree. 20s is a one-character change.
 */
export const HERO_ROTATE_MS = 10000;

/** Words the test counts against. Re-exported so the test imports one place. */
export { wordCount };
