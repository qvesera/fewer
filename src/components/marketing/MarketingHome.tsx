import { DotGrid } from "./DotGrid";
import { FeaturePlayground } from "./FeaturePlayground";
import { OpenSourceSection } from "./OpenSourceSection";
import { PrivacySection } from "./PrivacySection";

/**
 * The marketing home page (T-150, revised by the review follow-ups).
 *
 * Order: the graph IS the hero and the feature list in one section (headline
 * and CTAs in a compact bar, the demo cards full-bleed on the dot grid, canvas
 * controls in a floating View panel, one feature at a time in an inspector
 * panel) -> what it costs you: privacy, then open source.
 *
 * The illustration band that used to sit between them is gone: it rendered
 * nothing until `public/reorg-graph.svg` existed, and the canvas now carries
 * the transformation it was meant to show.
 *
 * Nothing on the page auto-advances: discovery is hover, focus and tap, so the
 * only moving parts are the marching edges and the pin ping, both of which
 * stop under prefers-reduced-motion.
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
