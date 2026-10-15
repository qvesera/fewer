import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./Reveal";

/**
 * Privacy (T-150 follow-up, layout reworked T-155). The claims are the ones
 * the pre-redesign page made, kept word for word because they are trust
 * statements a reader should be able to check against /privacy; only the em
 * dashes became commas, which is the house style rule (T-149).
 *
 * The shape is the mock's split: a left column holding the heading, a short
 * intro paragraph and the policy action, beside a right column that stacks
 * the six claims one per row at reading size (15px, two lines each) - one
 * shield per line instead of a centred 3-across grid that broke each claim
 * into short widow lines. Left-aligned; the centred-rhythm version (T-150
 * follow-up) put the heading on the page axis, which the split needs gone.
 */
const PRIVACY_POINTS = [
  "Runs locally in your browser, so your directory contents stay on your device by default.",
  "No account required. Sign in is optional, and only used for saved graphs and sharing across devices.",
  "Optional cloud connections are scoped: we fetch only the trees you ask for, and never store your connected account's contents.",
  "No selling your data, no advertising trackers, no hidden telemetry.",
  "Watch digests are opt-in; we only store the public URLs you add and email changes you requested.",
  "Hosting operates on standard server logs only.",
];

export function PrivacySection() {
  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Your data stays yours
          </h2>
          <p className="mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
            fewer is designed around a simple principle: your directory data stays yours. Signing
            in or connecting a cloud account is entirely optional, and when you do, we only use
            what you explicitly ask for.
          </p>
          <div className="mt-8">
            <Link
              href="/privacy"
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Read the Privacy Policy
            </Link>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <ul className="flex flex-col gap-3">
            {PRIVACY_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-left text-[15px] leading-relaxed text-foreground/90"
              >
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--fewer-file-icon)" }}
                  aria-hidden="true"
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
