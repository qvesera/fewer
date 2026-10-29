import type { ReactNode } from "react";
import Link from "next/link";
import { Ban, BellRing, Cloud, ScrollText, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./Reveal";

/**
 * Privacy (T-150 follow-up; split T-155; bento T-156, rebuilt). The claims are
 * the ones the pre-redesign page made, kept word for word because they are
 * trust statements a reader should be able to check against /privacy; only the
 * em dashes became commas, which is the house style rule (T-149).
 *
 * Shape: heading, intro and the policy action in a left column, vertically
 * CENTRED against the bento beside it (xl:items-center) - the two blocks read
 * as one band instead of a top-aligned column floating beside a stack. The
 * bento is a two column card grid: the local-first claim spans both beside
 * its shield, the authentication claim gets a display word and pairs with the
 * cloud claim, the tracker and digest statements pair next, the hosting-log
 * line spans both columns as the footnote strip it is, and the mono stat
 * badges - 0 trackers, local, AGPLv3, each checkable in /privacy or LICENSE -
 * close it as a band. Every card takes the same inset so one left edge and
 * one right edge come out of the bento, never a ragged one.
 *
 * Each tile is two states of one fixed box. At rest the TITLE - kicker and,
 * on the display card, its word - is out of the flow and centred, set one
 * size up, alone in the card. Engaged (hovered, or focused from the
 * keyboard), it slides to the top, steps down to its markup size, and the
 * claim fades in underneath it where the card reserved its slot. Nothing is
 * ever sized by the reveal: the claim keeps its space in the layout in both
 * states, so the bento's height - and, it being centred against its heading,
 * the whole band - cannot move. All of it runs on one timing
 * (--mk-reveal-dur over the house --ease-aurora curve), so the slide, the
 * step-down and the fade land together.
 *
 * That state machine lives inside @media (hover: hover) in globals.css,
 * never in the markup: a touch screen has no pointer to leave, so there the
 * title sits at the top and the claim is visible from the start, and
 * crawlers and screen readers get the copy either way. The hero claim and the
 * stat band are never withheld - they are the section's lead sentence and its
 * values, not tiles.
 *
 * The schematic the hero card used to carry is gone: it repeated the sentence
 * beside it and read as clip art, and so is the one-line mono strip that
 * briefly replaced it - the hero is the sentence paired with its shield, and
 * nothing else. The stats decorate promises the page already makes; they add
 * no new one.
 *
 * The split moves at xl, not lg: below that the section stacks, so the cards
 * keep a readable measure instead of squeezing to ~220px at 1024.
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

/** The six statements, in display order. Destructured: each card is bespoke. */
const [ACCOUNT, CLOUD, TRACKERS, DIGESTS, LOGS] = CLAIM_POINTS;

/** Sources: no trackers / local processing are /privacy; the licence is LICENSE. */
const PRIVACY_STATS = [
  { value: "0", label: "trackers, ads, telemetry" },
  { value: "local", label: "by default, on your device" },
  { value: "AGPLv3", label: "verify the source" },
];

/** The bento's shared chrome: an icon chip and a mono kicker on one line. */
function CardLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30"
        style={{ color: "var(--fewer-file-icon)" }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="mk-tile-kicker font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

/** A claim card's chrome: one inset for every card, and the hover hint. */
const CARD =
  "rounded-xl border border-border/60 bg-card/50 p-6 text-left transition-colors duration-200 hover:border-border";

/** A claim sits under its title's reserved slot, at one scale everywhere. */
const CLAIM = "text-base leading-relaxed text-foreground/90";

/**
 * A claim card: the title is absolutely placed (centred at rest, at the top
 * when engaged) and the claim, in flow, is what gives the card its height -
 * so the card is the same size in both states.
 */
function ClaimCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <li
      data-mk-privacy-card
      tabIndex={0}
      className={`mk-claim-card relative ${CARD} ${className}`}
    >
      {children}
    </li>
  );
}

/** A tile's title: kicker (and display word) as one block the reveal moves. */
function TileTitle({ children }: { children: ReactNode }) {
  return <div className="mk-tile-title">{children}</div>;
}

/**
 * A tile's claim: always in the layout - its padding is the slot the title
 * tops out into - and only ever faded by the reveal, never moved.
 */
function Claim({ children }: { children: ReactNode }) {
  return (
    <p data-mk-privacy-claim className={`mk-claim ${CLAIM}`}>
      {children}
    </p>
  );
}

export function PrivacySection() {
  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-center xl:gap-16">
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
          {/* One list of six statements in five cards: hierarchy instead of
              six identical rows, and every card on the bento's two edges. */}
          <ul className="grid gap-4 sm:grid-cols-2">
            <li
              data-mk-privacy-hero
              className="rounded-xl border border-border bg-card/70 p-6 text-left sm:col-span-2"
            >
              {/* Shield centred against the whole two-line block: items-center
                  drops its middle on the paragraph's middle, so it reads as
                  one unit with the sentence rather than pinned to line one. */}
              <div className="flex items-center gap-3 sm:gap-4">
                <ShieldCheck
                  className="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
                  style={{ color: "var(--fewer-file-icon)" }}
                  aria-hidden="true"
                />
                <span
                  data-mk-privacy-headline
                  className="text-xl font-semibold leading-snug text-foreground sm:text-2xl"
                >
                  {HERO_POINT}
                </span>
              </div>
            </li>

            <ClaimCard className="mk-claim-card--display">
              <TileTitle>
                <span className="mk-tile-kicker font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Account required
                </span>
                <p className="mk-tile-display mt-1 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  ZERO
                </p>
              </TileTitle>
              <Claim>{ACCOUNT}</Claim>
            </ClaimCard>

            <ClaimCard>
              <TileTitle>
                <CardLabel icon={<Cloud className="h-4 w-4" />}>Cloud connections</CardLabel>
              </TileTitle>
              <Claim>{CLOUD}</Claim>
            </ClaimCard>

            <ClaimCard>
              <TileTitle>
                <CardLabel icon={<Ban className="h-4 w-4" />}>Trackers, ads, telemetry</CardLabel>
              </TileTitle>
              <Claim>{TRACKERS}</Claim>
            </ClaimCard>

            <ClaimCard>
              <TileTitle>
                <CardLabel icon={<BellRing className="h-4 w-4" />}>Watch digests</CardLabel>
              </TileTitle>
              <Claim>{DIGESTS}</Claim>
            </ClaimCard>

            {/* The shortest statement spans both columns: a footnote strip is
                what a hosting-log line reads as - a half-width card would
                leave a hole beside it. */}
            <ClaimCard className="sm:col-span-2">
              <TileTitle>
                <CardLabel icon={<ScrollText className="h-4 w-4" />}>Server logs</CardLabel>
              </TileTitle>
              <Claim>{LOGS}</Claim>
            </ClaimCard>
          </ul>

          {/* The short version, in mono: each badge is a claim the page
              already makes, checkable in /privacy or LICENSE. Cell padding
              matches the cards so the first value sits on their left edge. */}
          <div className="mt-4 grid grid-cols-3 rounded-xl border border-border/60 bg-card/40">
            {PRIVACY_STATS.map((stat) => (
              <div
                key={stat.value}
                data-mk-privacy-stat
                className="flex flex-col gap-1 border-l border-border/60 p-6 first:border-l-0"
              >
                <span className="font-mono text-base font-semibold tabular-nums text-foreground sm:text-lg">
                  {stat.value}
                </span>
                <span className="text-xs uppercase leading-snug tracking-wider text-muted-foreground">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
