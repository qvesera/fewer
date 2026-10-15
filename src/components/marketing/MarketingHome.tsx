import { DotGrid } from "./DotGrid";
import { FeaturePlayground } from "./FeaturePlayground";
import { HeroRotator } from "./HeroRotator";
import { OpenSourceSection } from "./OpenSourceSection";
import { PrivacySection } from "./PrivacySection";
import { SmoothScroll } from "./SmoothScroll";

/**
 * The marketing home page (T-150, revised by the review follow-ups; split
 * into a hero screen and a demo screen in T-161).
 *
 * Order: the promise owns the first screen on its own (T-161), so a first
 * read is four sentences and nothing else -> the graph IS the feature list
 * in the section below (the demo cards inside a window chassis whose title
 * bar holds the View controls, one feature at a time in an inspector panel)
 * -> what it costs you: privacy, then open source, in the same centred rhythm
 * so the two read as one closing chapter.
 *
 * The hero is a full viewport minus the sticky header, so the canvas arrives
 * on the first scroll and the page re-centers the promise when the reader
 * comes back up. That first scroll is a jump: SmoothScroll.tsx takes the one
 * opening gesture and lands the reader on #features, then hands scrolling
 * back to the page. Its four messages start their clock as soon as the page
 * does, and are always in the HTML: a crawler and a no-JS reader get all four,
 * while a prefers-reduced-motion reader gets the first one, parked. Scrolling
 * itself is eased by Lenis (SmoothScroll.tsx), home page only, and falls back
 * to native scroll under prefers-reduced-motion or on a touch screen.
 *
 * The illustration band that used to sit between the sections is gone: it
 * rendered nothing until `public/reorg-graph.svg` existed, and the canvas now
 * carries the transformation it was meant to show.
 *
 * The only things that move on their own are the hero messages, the feature
 * tour and the active card's port ping, and all three park themselves: both
 * rotations never start under prefers-reduced-motion, pause while the reader
 * is off the page or on the other pane, and carry a real pause button; the
 * ping, the marching edges and the glow's ring all stop under
 * prefers-reduced-motion too, through the one global rule.

 *
 * The hero's headings do NOT carry the phrase "interactive graph": T-161's
 * rule is that a newcomer does not want a graph, they want the folder to
 * make sense. The phrase survives where such a reader looks for it - the
 * metadata, the section lead-in below, and the docs - and e2e/marketing.spec.ts
 * pins that the demo section still names it. The h1 lives in HeroRotator,
 * which is a client component - and client components are still
 * server-rendered, so the headings reach the HTML and the crawler either way.
 * The no-JS style forces the reveal resting state, so the page never depends
 * on JavaScript to be readable.
 */
export function MarketingHome() {
  return (
    <>
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
      </noscript>

      <SmoothScroll />
      <DotGrid />
      <HeroRotator />
      <FeaturePlayground />
      <PrivacySection />
      <OpenSourceSection />
    </>
  );
}
