import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./Reveal";

/**
 * Privacy (T-150 follow-up). The claims are the ones the pre-redesign page
 * made, kept word for word because they are trust statements a reader should be
 * able to check against /privacy; only the em dashes became commas, which is
 * the house style rule (T-149).
 *
 * What changed is the shape: the section used to be a paragraph plus a column
 * of six sentences, which reads as a wall, and then a left heading column
 * beside a grid, which left a tall empty gutter next to Open source's centred
 * band below it. It is now the same rhythm as that band - centred heading,
 * centred action, content underneath - so the two closing sections read as one
 * chapter rather than two components that happened to land together.
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
      <div className="mx-auto max-w-6xl px-6 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Your data stays yours
          </h2>
          <div className="mt-8 flex justify-center">
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
          <ul className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRIVACY_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-left text-sm text-foreground/90"
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
