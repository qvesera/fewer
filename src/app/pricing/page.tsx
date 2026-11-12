import type { Metadata } from "next";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PricingCards } from "@/components/marketing/PricingCards";
import { PricingContactForm } from "@/components/marketing/PricingContactForm";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Pricing | Fewer",
  description:
    "Fewer is free to use with no account. Pro adds the panel workspace, tags, unwatermarked exports and watch digests; Enterprise is set up with you by hand.",
};

/**
 * The pricing page (T-257).
 *
 * Three cards, two switches and one form. The prices are display prices:
 * there is no checkout yet, so the page says so and the way to buy is the
 * form at the bottom, which sends an enquiry with the visitor in reply-to.
 */
export default function PricingPage() {
  return (
    <MarketingLayout>
      <section className="relative z-10 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h1 className="text-center text-4xl font-bold tracking-tight text-foreground">
              Pricing
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
              The whole local app is free, with no account and no card. Pro is for the folders
              that have grown up, and Enterprise is set up with you by hand.
            </p>
          </Reveal>

          <PricingCards />
        </div>
      </section>

      <section id="contact" className="relative z-10 scroll-mt-[var(--mk-header-h)] pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Tell us what you need
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Ask about Pro or about Enterprise. We read every message and reply to the address
              you leave here.
            </p>
          </Reveal>
          <div className="mt-8">
            <PricingContactForm defaultPlan="pro" />
          </div>
          <noscript>
            <p className="mt-6 text-sm text-muted-foreground">
              The form needs JavaScript. Without it, write to enquiry at fewer.directory.
            </p>
          </noscript>
        </div>
      </section>
    </MarketingLayout>
  );
}
