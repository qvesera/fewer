import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APP_URL } from "./MarketingLayout";
import { buttonVariants } from "@/components/ui/button";
import { Capabilities } from "./Capabilities";
import { DotGrid } from "./DotGrid";
import { HowItWorks } from "./HowItWorks";
import { Reveal } from "./Reveal";
import { TextVsGraph } from "./TextVsGraph";
import { TransformationBand } from "./TransformationBand";
import { TrustStrip } from "./TrustStrip";

/**
 * The marketing home page (T-150).
 *
 * Story order: what it is (hero) → the proof in one gesture (tree vs graph —
 * the one place the sample graph appears) → the illustration beat → how it
 * works → what it does → what it costs you (nothing). Sections sit above the
 * fixed dot-grid backdrop, which is the same surface as the app canvas.
 *
 * The h1 keeps the phrase "interactive graph": e2e/marketing.spec.ts pins it
 * through the /welcome redirect, and it is the sentence the product is known
 * by. The no-JS style forces the reveal resting state, so the page never
 * depends on JavaScript to be readable.
 */
export function MarketingHome() {
  return (
    <>
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
      </noscript>

      <DotGrid />

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-16 lg:pt-24">
        <div className="max-w-3xl">
          <p
            className="mk-rise font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            style={{ animationDelay: "0ms" }}
          >
            Directory to graph, in the browser
          </p>
          <h1
            className="mk-rise mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
            style={{ animationDelay: "80ms" }}
          >
            Turn any directory into an interactive graph
          </h1>
          <p
            className="mk-rise mt-6 max-w-xl text-lg text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            Point it at a folder. Get a map you can drag, search and export. Nothing installs,
            and no file leaves your browser unless you ask for it.
          </p>
          <div className="mk-rise mt-8 flex flex-wrap gap-4" style={{ animationDelay: "240ms" }}>
            <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
              Launch the app
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Read the docs
            </Link>
          </div>
          <p
            className="mk-rise mt-8 font-mono text-xs text-muted-foreground"
            style={{ animationDelay: "320ms" }}
          >
            drag · search · group · export · share
          </p>
        </div>
      </section>

      {/* The comparison that explains the product in one gesture */}
      <section id="compare" className="relative z-10 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Same folder. Two views.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.95em]">
                tree
              </code>{" "}
              lists the names. fewer shows you the shape, so you can see what changes before you
              touch anything.
            </p>
            <TextVsGraph />
          </Reveal>
        </div>
      </section>

      <TransformationBand />
      <HowItWorks />
      <Capabilities />
      <TrustStrip />
    </>
  );
}
