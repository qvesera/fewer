/**
 * The home page's hero promise (T-161).
 *
 * Four messages, one slot: the page opens on the first one and only starts
 * rotating once the reader has scrolled, so nothing moves while they are
 * still reading the promise. `HeroRotator.tsx` owns the behaviour; this module
 * owns the copy, in a pure file so the limits are unit-testable the same way
 * `marketingFeatures.ts` is.
 *
 * The audience rule for this copy: a newcomer who does not want a graph. No
 * slide may mention one - the word "graph" now lives in the metadata, the
 * section lead-in and the docs, where a reader who already knows what they
 * want can find it. The four slides are the four jobs the product does: see
 * everything, find one thing, understand a folder, fix a mess.
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
];

/** The trust line, which never rotates: a promise that changes is not one. */
export const HERO_TRUST_LINE = "Runs in your browser. Your files never leave your device.";

export const KICKER_MAX_WORDS = 6;
export const HEADLINE_MAX_WORDS = 8;
export const LINE_MAX_WORDS = 20;

/**
 * How long a message holds. One constant on purpose: 20s is a one-character
 * change, and so is a faster stop if the tour ever reads as slow.
 */
export const HERO_ROTATE_MS = 15000;

/**
 * The first scroll that arms the rotation. Below this the page is still
 * where the reader landed it, so the hero stays on message one. 16px is past
 * the browser's own scroll-on-click noise but before any real reading.
 */
export const HERO_ARM_SCROLL_PX = 16;

/** Words the test counts against. Re-exported so the test imports one place. */
export { wordCount };
