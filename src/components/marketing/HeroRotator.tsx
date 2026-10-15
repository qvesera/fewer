"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import {
  HERO_ROTATE_MS,
  HERO_SLIDES,
  HERO_TRUST_LINE,
} from "@/lib/fewer/marketingHero";
import { APP_URL } from "./MarketingLayout";

/**
 * The hero: one screen of promise, four ways of saying it, on a clock (T-161,
 * follow-up for the smooth-scroll pass).
 *
 * Why four messages and not one: the product does four jobs (see a folder,
 * find a file, understand it, fix a mess) and no single sentence a newcomer can
 * parse does all four. One slot, four stops, HERO_ROTATE_MS each. The clock
 * starts as soon as the page does, so a reader who never touches anything
 * still sees all four - and the bar inside the active dot drains for exactly
 * as long as the message has left.
 *
 * The rules that make an automatic rotation polite:
 *  - It only runs where it can be seen (in view, tab in front), never under
 *    prefers-reduced-motion, and not while the pointer or the keyboard is
 *    inside it - the feature tour's own gates, so the two rotations on one
 *    page behave the same.
 *  - Everything that moves it is a real control: dots to jump to a message,
 *    arrows to step through them, a toggle to park it. Nothing here is
 *    hover-only, and nothing is timed while it is parked - the countdown is
 *    re-keyed on every clock tick, so a pause and its resume restart the bar
 *    together with the interval instead of leaving an emptied one.
 *
 * The four messages live in ONE grid cell, so the cell is as tall as the
 * tallest one and a swap never moves the buttons under it. Only the active
 * message is visible; the rest are `aria-hidden`, which means exactly one
 * heading is on screen and one is announced. Each message is its own <h1> so
 * all four are in the HTML a crawler reads, and none of them is duplicated
 * elsewhere on the page.
 *
 * The hero is a full viewport minus the sticky header (--mk-header-h), so the
 * first screen is the promise alone and the demo canvas arrives on the scroll.
 * Scrolling itself is eased by Lenis (SmoothScroll.tsx), which drives the
 * real window scroll - the observers and the anchor below keep working.
 */
export function HeroRotator() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  /** Hover or focus inside the hero: stop while someone is actually reading. */
  const [reading, setReading] = useState(false);
  /**
   * Bumped every time the interval is scheduled. The countdown bar is keyed on
   * it, so bar and clock always describe the same window of time.
   */
  const [clock, setClock] = useState(0);
  const { hasReducedMotion } = useDevice();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) =>
      setInView(entries.some((entry) => entry.isIntersecting)),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const running = playing && inView && tabVisible && !reading && !hasReducedMotion;

  // The clock: one message per interval, and every gate that turns it off
  // starts the next interval over, so nothing is cut in half by a hover. The
  // countdown bar is keyed on `clock`, bumped here, so bar and interval always
  // describe the same window - a resume restarts both.
  useEffect(() => {
    if (!running) return;
    setClock((tick) => tick + 1);
    const timer = setTimeout(
      () => setIndex((current) => (current + 1) % HERO_SLIDES.length),
      HERO_ROTATE_MS,
    );
    return () => clearTimeout(timer);
  }, [running, index]);

  /** Jump to a message; wraps, so the arrows can step past either end. */
  const goTo = (next: number) => {
    setIndex((next + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative z-10 flex min-h-[calc(100svh_-_var(--mk-header-h))] items-center py-16"
    >
      <div
        className="mx-auto w-full max-w-4xl px-6 text-center"
        onPointerEnter={() => setReading(true)}
        onPointerLeave={() => setReading(false)}
        onFocus={() => setReading(true)}
        onBlur={() => setReading(false)}
      >
        {/* The messages. aria-live follows the inspector's rule: the page is
            silent while it moves itself, and speaks once a reader takes over. */}
        <div
          className="grid"
          aria-live={running ? "off" : "polite"}
          data-mk-hero-state={running ? "running" : "idle"}
        >
          {HERO_SLIDES.map((slide, i) => (
            <div
              key={slide.id}
              data-mk-hero-slide={slide.id}
              data-active={i === index ? "1" : "0"}
              aria-hidden={i !== index}
              className={[
                "mk-hero-slide col-start-1 row-start-1",
                i === index ? "" : "pointer-events-none",
              ].join(" ")}
            >
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:text-sm">
                {slide.kicker}
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
                {slide.headline}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
                {slide.line}
              </p>
            </div>
          ))}
        </div>

        {/* The controls. Arrows step, dots jump, the toggle parks the clock:
            the rotation is always the reader's to stop, which is the whole
            reason it is allowed to start on its own. The active dot carries
            the countdown - a bar that empties for exactly as long as the
            message has left, restarted by `clock` whenever the interval is. */}
        <div
          role="group"
          aria-label="Messages"
          className="mt-8 flex items-center justify-center gap-3"
        >
          <button
            type="button"
            aria-label="Previous message"
            title="Previous message"
            data-mk-hero-step="prev"
            onClick={() => goTo(index - 1)}
            className="min-hit cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            {HERO_SLIDES.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Message ${i + 1} of ${HERO_SLIDES.length}`}
                aria-current={i === index || undefined}
                onClick={() => goTo(i)}
                className={[
                  "min-hit relative h-2 cursor-pointer rounded-full transition-all duration-200",
                  i === index
                    ? "w-6 bg-primary/25"
                    : "w-2 bg-border hover:bg-muted-foreground/50",
                ].join(" ")}
              >
                {i === index && (
                  <span
                    key={`${i}:${clock}`}
                    data-mk-hero-timer=""
                    aria-hidden="true"
                    className="mk-hero-timer absolute inset-0 rounded-full bg-primary"
                    style={{ "--hero-hold": `${HERO_ROTATE_MS}ms` } as CSSProperties}
                  />
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="Next message"
            title="Next message"
            data-mk-hero-step="next"
            onClick={() => goTo(index + 1)}
            className="min-hit cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label={playing ? "Pause the messages" : "Play the messages"}
            title={playing ? "Pause the messages" : "Play the messages"}
            data-mk-hero={playing ? "pause" : "play"}
            onClick={() => setPlaying((was) => !was)}
            className="min-hit -ml-1 cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
            Launch the app
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Read the docs
          </Link>
        </div>

        {/* The trust line is static on purpose: a promise that changes is not
            one. It is the first thing a newcomer checks, so it never rotates
            out. Nothing in the hero animates on first paint either - T-161
            asked for a still first screen, and the rotation waits for the
            scroll. */}
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
          {HERO_TRUST_LINE}
        </p>
      </div>
    </section>
  );
}
