import { DotGrid } from "./DotGrid";
import { FeaturePlayground } from "./FeaturePlayground";
import { OpenSourceSection } from "./OpenSourceSection";
import { PrivacySection } from "./PrivacySection";

/**
 * The marketing home page (T-150, revised by the review follow-ups).
 *
 * Order: the graph IS the hero and the feature list in one section (headline
 * and CTAs at the top, the demo cards on the dot grid, a View toolbar above
 * them, one feature at a time in an inspector panel below) -> what it costs
 * you: privacy, then open source, in the same centred rhythm so the two read
 * as one closing chapter.
 *
 * The illustration band that used to sit between them is gone: it rendered
 * nothing until `public/reorg-graph.svg` existed, and the canvas now carries
 * the transformation it was meant to show.
 *
 * The only thing that moves on its own is the feature tour, and it parks
 * itself: it never starts under prefers-reduced-motion, it pauses while the
 * reader is off the page or on the tree pane, and the inspector carries a real
 * pause button. The marching edges and the pin ping stop under
 * prefers-reduced-motion too.
 *
 * The h1 keeps the phrase "interactive graph": e2e/marketing.spec.ts pins it
 * through the /welcome redirect, and it is the sentence the product is known
 * by. It lives inside FeaturePlayground, which is a client component - client
 * components are still server-rendered, so the heading reaches the HTML and
 * the crawler either way. The no-JS style forces the reveal resting state, so
 * the page never depends on JavaScript to be readable.
 */
export function MarketingHome() {
  return (
    <>
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
      </noscript>

      <DotGrid />
      <FeaturePlayground />
      <PrivacySection />
      <OpenSourceSection />
    </>
  );
}
