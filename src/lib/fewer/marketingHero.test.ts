import { describe, expect, test } from "bun:test";
import {
  HEADLINE_MAX_WORDS,
  HERO_SLIDES,
  KICKER_MAX_WORDS,
  LINE_MAX_WORDS,
  wordCount,
} from "./marketingHero";

describe("marketingHero", () => {
  test("there are five messages, and their ids are unique", () => {
    // Five is the number of jobs the product does, and the dots below the hero
    // are sized for exactly five too.
    expect(HERO_SLIDES).toHaveLength(5);
    const ids = HERO_SLIDES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no kicker or line repeats, so no slide feels copy-pasted", () => {
    expect(new Set(HERO_SLIDES.map((s) => s.kicker)).size).toBe(HERO_SLIDES.length);
    expect(new Set(HERO_SLIDES.map((s) => s.line)).size).toBe(HERO_SLIDES.length);
  });

  test("copy stays inside the reading budget", () => {
    for (const slide of HERO_SLIDES) {
      expect(wordCount(slide.kicker)).toBeLessThanOrEqual(KICKER_MAX_WORDS);
      expect(wordCount(slide.headline)).toBeLessThanOrEqual(HEADLINE_MAX_WORDS);
      expect(wordCount(slide.line)).toBeLessThanOrEqual(LINE_MAX_WORDS);
    }
  });

  test("the messages never say graph or map: that is the point of the rewrite", () => {
    // A newcomer does not want a graph; they want the folder to make sense.
    // The word survives in the metadata, the section lead-in and the docs -
    // never in the thing the reader lands on first.
    for (const slide of HERO_SLIDES) {
      expect(`${slide.kicker} ${slide.headline}`).not.toMatch(/graph|\bmap\b/i);
    }
  });

  test("no headline repeats, and the house style rule holds", () => {
    const headlines = HERO_SLIDES.map((s) => s.headline);
    expect(new Set(headlines).size).toBe(headlines.length);
    for (const slide of HERO_SLIDES) {
      // Em dashes became commas in the marketing copy in T-149 and stayed that
      // way: the page is read fast, and a dash is a second thing to parse.
      expect(`${slide.kicker} ${slide.headline} ${slide.line}`).not.toContain("—");
    }
  });
});
