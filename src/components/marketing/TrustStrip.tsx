import Link from "next/link";
import { ArrowRight, EyeOff, Github, ShieldCheck, UserRound } from "lucide-react";
import { APP_URL } from "./MarketingLayout";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./Reveal";

/**
 * Trust strip + closing CTA (T-150). One row replaces the two long centred
 * prose sections the old page carried; the detail stays in /privacy and the
 * docs, and the row only makes claims the product keeps.
 */
const POINTS = [
  { icon: ShieldCheck, label: "Runs in your browser" },
  { icon: UserRound, label: "No account needed" },
  { icon: EyeOff, label: "No trackers, no telemetry" },
];

export function TrustStrip() {
  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              See your folder as a map
            </h2>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Open the app, load a folder or the sample project, and you are looking at the tree
              in under a minute.
            </p>
            <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
              Launch the app
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <ul className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-muted-foreground">
            {POINTS.map((point) => (
              <li key={point.label} className="inline-flex items-center gap-2">
                <point.icon className="h-4 w-4 text-fewer-file-icon" aria-hidden="true" />
                {point.label}
              </li>
            ))}
            <li>
              <Link
                href="https://github.com/qvesera/fewer"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 transition-colors duration-200 hover:text-foreground"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                Open source, AGPLv3
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="transition-colors duration-200 hover:text-foreground"
              >
                Your data stays yours
              </Link>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
