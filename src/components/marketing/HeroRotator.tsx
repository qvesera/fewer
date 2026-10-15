"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Pause, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import {
  HERO_ARM_SCROLL_PX,
  HERO_ROTATE_MS,
  HERO_SLIDES,
  HERO_TRUST_LINE,
} from "@/lib/fewer/marketingHero";
import { APP_URL } from "./MarketingLayout";

/**
 * The hero: one screen of promise, and four ways of saying it (T-161).
 *
 * Why four messages and not one: the product does four jobs (see a folder,
 * find a file, understand it, fix it) and no single sentence a newcomer can
 * parse does all four. One slot, four stops, 15s each.
 *
 * The rules that make it polite:
 *  - NOTHING moves until the reader has scrolled. On first paint the page is
 *    static, which is also the snapshot a crawler or a no-JS reader gets.
 *  - Once armed it only runs where it can be seen (in view, tab in front),
 *    never under prefers-reduced-motion, and not while the pointer or the
 *    keyboard is inside it - the tour's own gates, so the two rotations on
 *    one page behave the same.
 *  - It parks for real: the dots step by hand, the toggle stops the clock,
 *    and the pause state is a button's, not a hover's.
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
 */
export function HeroRotator() {
  const [index, setIndex] = useState(0);
  /** Set by the first real scroll (or any dot press): rotation is allowed. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  /** Hover or focus inside the hero: stop while someone is actually reading. */
  const [reading, setReading] = useState(false);
  const { hasReducedMotion } = useDevice();
  const sectionRef = useRef<HTMLElement>(null);

  // Arm once, and forget the listener: past this point the reader has left
  // the fold, so the promise may start earning its rotation. Calling arm()
  // on mount covers a restored or anchored scroll, where no event fires.
  useEffect(() => {
    if (armed) return;
    const arm = () => {
      if (window.scrollY > HERO_ARM_SCROLL_PX) setArmed(true);
    };
    arm();
    window.addEventListener("scroll", arm, { passive: true });
    return () => window.removeEventListener("scroll", arm);
  }, [armed]);

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

  const running = armed && playing && inView && tabVisible && !reading && !hasReducedMotion;

  // The clock: one message per interval, and every gate that turns it off
  // starts the next interval over, so nothing is cut in half by a hover.
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setIndex((current) => (current + 1) % HERO_SLIDES.length),
      HERO_ROTATE_MS,
    );
    return () => clearTimeout(timer);
  }, [running, index]);

  const goTo = (next: number) => {
    setArmed(true);
    setIndex(next);
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

        {/* The controls. Dots step by hand, the toggle parks the clock: the
            rotation is always the reader's to stop, which is the whole reason
            it is allowed to start. */}
        <div
          role="group"
          aria-label="Messages"
          className="mt-8 flex items-center justify-center gap-3"
        >
          <div className="flex items-center gap-2">
            {HERO_SLIDES.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Message ${i + 1} of ${HERO_SLIDES.length}`}
                aria-current={i === index || undefined}
                onClick={() => goTo(i)}
                className={[
                  "min-hit h-2 cursor-pointer rounded-full transition-all duration-200",
                  i === index ? "w-6 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/50",
                ].join(" ")}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={playing ? "Pause the messages" : "Play the messages"}
            title={playing ? "Pause the messages" : "Play the messages"}
            data-mk-hero={playing ? "pause" : "play"}
            onClick={() => {
              setArmed(true);
              setPlaying((was) => !was);
            }}
            className="min-hit cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
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
