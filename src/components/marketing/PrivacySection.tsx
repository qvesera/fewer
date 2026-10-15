import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./Reveal";

/**
 * Privacy (T-150 follow-up; split T-155; bento T-156). The claims are the ones
 * the pre-redesign page made, kept word for word because they are trust
 * statements a reader should be able to check against /privacy; only the em
 * dashes became commas, which is the house style rule (T-149).
 *
 * The shape is the mock's split - heading, intro and the policy action in a
 * left column - and the right column is a bento rather than six identical
 * rows: the primary reassurance gets a hero card with a schematic of the
 * local sandbox (nothing crosses the browser boundary), three mono stat
 * badges carry the short version (0 trackers, local, AGPLv3 - each checkable
 * in /privacy or LICENSE), and the remaining claims are compact rows
 * underneath. The stats decorate promises the page already makes; they add
 * no new one.
 */

const HERO_POINT =
  "Runs locally in your browser, so your directory contents stay on your device by default.";
const CLAIM_POINTS = [
  "No account required. Sign in is optional, and only used for saved graphs and sharing across devices.",
  "Optional cloud connections are scoped: we fetch only the trees you ask for, and never store your connected account's contents.",
  "No selling your data, no advertising trackers, no hidden telemetry.",
  "Watch digests are opt-in; we only store the public URLs you add and email changes you requested.",
  "Hosting operates on standard server logs only.",
];

/** Sources: no trackers / local processing are /privacy; the licence is LICENSE. */
const PRIVACY_STATS = [
  { value: "0", label: "trackers, ads, telemetry" },
  { value: "local", label: "by default, on your device" },
  { value: "AGPLv3", label: "verify the source" },
];

/**
 * The local sandbox, drawn from tokens: a dashed browser boundary with two
 * graph cards inside and one egress arrow struck at the wall. Decorative -
 * the claim beside it says the same thing in words, so this is aria-hidden.
 */
function SandboxDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 150 104"
      className={`h-[88px] w-[132px] shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      {/* Window chrome: the boundary IS the browser. */}
      <circle cx="10" cy="7" r="2.2" fill="var(--muted-foreground)" opacity="0.5" />
      <circle cx="18" cy="7" r="2.2" fill="var(--muted-foreground)" opacity="0.5" />
      <circle cx="26" cy="7" r="2.2" fill="var(--muted-foreground)" opacity="0.5" />
      <text x="36" y="10" fontSize="7.5" fontFamily="monospace" fill="var(--muted-foreground)">
        browser
      </text>
      <rect
        x="1"
        y="15"
        width="116"
        height="87"
        rx="8"
        fill="none"
        stroke="var(--border)"
        strokeDasharray="4 3"
      />
      {/* A folder card and a file card, connected the way the canvas draws. */}
      <rect
        x="12"
        y="30"
        width="46"
        height="18"
        rx="5"
        fill="var(--fewer-folder-bg)"
        stroke="var(--fewer-folder-border)"
      />
      <rect
        x="72"
        y="66"
        width="34"
        height="16"
        rx="5"
        fill="var(--fewer-file-bg)"
        stroke="var(--fewer-file-border)"
      />
      <path
        d="M 58 42 C 66 42 64 74 72 74"
        fill="none"
        stroke="var(--mk-accent, var(--fewer-edge))"
        strokeWidth="1.5"
        strokeDasharray="3 2.5"
      />
      {/* The egress that never happens: the arrow stops at the wall, struck. */}
      <path
        d="M 92 26 L 146 26"
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1.5"
        opacity="0.7"
      />
      <path d="M 141 22 L 146 26 L 141 30" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" opacity="0.7" />
      <path
        d="M 113 20 L 121 32 M 121 20 L 113 32"
        stroke="var(--fewer-file-icon)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text x="99" y="42" fontSize="6.5" fontFamily="monospace" fill="var(--muted-foreground)">
        no egress
      </text>
    </svg>
  );
}

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
          <div className="flex flex-col gap-3">
            {/* The hero claim: the primary reassurance, bigger, with the
                sandbox drawn beside it. Same words as always - the picture
                only shows what the sentence already promises. */}
            <ul>
              <li
                data-mk-privacy-hero
                className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-4 text-left text-base leading-relaxed text-foreground sm:flex-row sm:items-start sm:gap-4 sm:p-5 sm:text-lg"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <ShieldCheck
                    className="mt-1 h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                    style={{ color: "var(--fewer-file-icon)" }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 font-medium">{HERO_POINT}</span>
                </div>
                <SandboxDiagram className="self-start sm:self-auto" />
              </li>
            </ul>

            {/* The short version, in mono: each badge is a claim the page
                already makes, checkable in /privacy or LICENSE. */}
            <div className="grid grid-cols-3 gap-3">
              {PRIVACY_STATS.map((stat) => (
                <div
                  key={stat.value}
                  data-mk-privacy-stat
                  className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-card/50 p-3"
                >
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground sm:text-base">
                    {stat.value}
                  </span>
                  <span className="text-[10px] uppercase leading-snug tracking-wider text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* The remaining claims, compact. */}
            <ul className="flex flex-col gap-3">
              {CLAIM_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-left text-sm leading-relaxed text-foreground/90"
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
          </div>
        </Reveal>
      </div>
    </section>
  );
}
