"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "./MarketingLayout";
import { useDevice } from "@/hooks/use-device";
import { graphToTextLines } from "@/lib/fewer/marketingPreview";
import { MARKETING_FEATURES } from "@/lib/fewer/marketingFeatures";
import { PreviewGraph } from "./PreviewGraph";
import { FeatureProof } from "./FeatureProof";

/**
 * The hero AND the feature story (T-150 follow-up, fourth pass).
 *
 * The canvas is the page: on the same dot grid the app draws, with no browser
 * chrome and no card around it, in the same column as the headline, the
 * inspector and the rail - so nothing is stranded at a viewport edge. Its two
 * controls are furniture the app itself has: a View toolbar (the tree/fewer
 * toggle and the accent swatches) above the canvas, and an inspector panel
 * below it with the feature's name in the title bar.
 *
 * One feature at a time, in that inspector. It advances two ways: the reader
 * (pin, card, chip, or the arrows in the title bar) and the tour, which walks
 * the catalogue every TOUR_MS while it can be seen and nobody has touched
 * anything. The pause button is real - and the tour starts parked under
 * prefers-reduced-motion, where anything that moves on its own is the wrong
 * default. While it runs the card is not announced; once the reader stops it,
 * aria-live takes over so keyboard and screen-reader users get the same card a
 * sighted reader parked.
 *
 * The rail is grouped by what the product calls things ("Arrange & edit", not
 * "Capabilities"), each group one short row of chips with its longer sentence
 * as the title tooltip: three words per feature to skim, the sentence on
 * demand, and nothing to read to use the page.
 */

const TREE_LINES = graphToTextLines();

const PANE_TRANSITION =
  "opacity var(--dur-slow) var(--ease-enter), transform var(--dur-slow) var(--ease-enter)";

/** One feature per step. Long enough to read a card, short enough to keep moving. */
const TOUR_MS = 5000;

/**
 * The brand accents, in the order the canvas palette ships them. Hovering or
 * picking one re-tints the demo cards' edges live - the cheapest honest way to
 * show that the canvas is themed, without a second screenshot.
 */
const SWATCHES = [
  { name: "Fuchsia", value: "#ff00ff" },
  { name: "Purple", value: "#a855f7" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Amber", value: "#ffbf00" },
  { name: "Orange", value: "#ff8c00" },
];

/** Rail groups. Concrete product words; each tip is the hover-only sentence. */
const CATEGORIES = [
  {
    id: "arrange",
    label: "Arrange & edit",
    tip: "Sketch the structure first, box cards into groups, rename forty at once, and re-flow the layout without leaving the keyboard.",
    features: ["plan", "groups", "batch", "rename", "organize", "keyboard"],
  },
  {
    id: "connect",
    label: "Watch & connect",
    tip: "Pull a tree from disk, a URL, a repo or an archive, watch a public index for changes, and take the graph back out in eight formats.",
    features: ["import", "watch", "export"],
  },
  {
    id: "share",
    label: "Look & share",
    tip: "Recolour the canvas from a preset or by hand, share it as a link, and colour-code cards with tags.",
    features: ["themes", "share", "tags"],
  },
] as const;

type View = "tree" | "graph";

/** How a feature got picked: only the deliberate ones may steal the view. */
type Via = "hover" | "click" | "focus";

function tabClass(active: boolean) {
  return [
    "cursor-pointer rounded-md px-4 py-1.5 font-mono text-sm transition-colors duration-200",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

/** The grip the app's dialogs carry in their title area. Decorative. */
function GripDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1 w-1 rounded-full" style={{ background: "var(--muted-foreground)" }} />
      ))}
    </span>
  );
}

/** Title-bar control: a bare icon button in the panel's own chrome. */
function BarButton({
  label,
  onClick,
  children,
  ...rest
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
      className="cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function FeaturePlayground() {
  const [view, setView] = useState<View>("graph");
  const [accent, setAccent] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string>(MARKETING_FEATURES[0].id);
  /**
   * The reader's Crown Shyness setting, live on the canvas. It belongs to the
   * page, not to the card: a control that reverted when the tour moved on
   * would be a control that broke.
   */
  const [shyness, setShyness] = useState(1);
  /**
   * Whether the reader has touched anything yet. At rest the graph is whole:
   * nothing dimmed, no pin pressed. Loading straight into a dimmed state made
   * the page look like it was already half-hovered, which is the one thing a
   * demo graph must not look like before anyone touches it.
   */
  const [engaged, setEngaged] = useState(false);

  /* The tour: on by default, parked under reduced motion, restartable. */
  const [playing, setPlaying] = useState(true);
  /** Bumped by every reader activation: the quiet clock starts again from it. */
  const [tourToken, setTourToken] = useState(0);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  const sectionRef = useRef<HTMLElement>(null);
  /**
   * Last pointer coordinates seen, and whether a hover is therefore the
   * reader's. The browser fires pointerover and enter when the layout slides a
   * new element under a STATIONARY pointer too - the dial re-flowing the canvas
   * is the obvious one - and those carry the same coordinates as the movement
   * that last actually happened, so a hover only counts when its coordinates
   * differ from the ones already seen.
   */
  const lastPointer = useRef({ x: -1, y: -1 });
  const hoverAuthorised = useRef(false);
  const { isTouch } = useDevice();

  const feature = useMemo(
    () => MARKETING_FEATURES.find((f) => f.id === activeId) ?? MARKETING_FEATURES[0],
    [activeId],
  );
  const featureIndex = MARKETING_FEATURES.indexOf(feature);

  /**
   * Every activation lights its hotspot and restarts the tour's clock, so a
   * feature the reader just picked always gets a full quiet interval. Hover
   * never steals the view - a pointer crossing the canvas must not undo a
   * deliberate "show me the tree" - while a click, a focus or the tour's own
   * step does not need to either.
   */
  const activate = useCallback((id: string, via: Via = "click") => {
    // A hover the pointer did not ask for is not a reader's decision: moving
    // the layout under a stationary pointer (the dial re-flowing the canvas is
    // the obvious one) fires enter events on whatever lands beneath it.
    if (via === "hover") {
      if (!hoverAuthorised.current) return;
      hoverAuthorised.current = false;
    }
    setActiveId(id);
    setEngaged(true);
    setTourToken((token) => token + 1);
    if (via === "click" || via === "focus") setView("graph");
  }, []);

  const step = useCallback(
    (direction: -1 | 1) => {
      const index = MARKETING_FEATURES.findIndex((f) => f.id === activeId);
      const next = (index + direction + MARKETING_FEATURES.length) % MARKETING_FEATURES.length;
      activate(MARKETING_FEATURES[next].id, "click");
    },
    [activeId, activate],
  );

  // The tour only runs where it can be seen: in view, on the graph pane, with
  // the tab in front, and never under prefers-reduced-motion.
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

  // Real movement authorises a hover: pointermove, pointerdown, and pointerover
  // only when its coordinates differ from the last ones seen. A layout shift
  // re-fires pointerover with the same coordinates, which is exactly the hover
  // that must be ignored.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const mark = (x: number, y: number) => {
      if (x !== lastPointer.current.x || y !== lastPointer.current.y) {
        lastPointer.current = { x, y };
        hoverAuthorised.current = true;
      }
    };
    const onPointer = (event: Event) => {
      const pointer = event as PointerEvent;
      mark(pointer.clientX, pointer.clientY);
    };
    el.addEventListener("pointermove", onPointer, { passive: true });
    el.addEventListener("pointerover", onPointer, { passive: true });
    el.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerover", onPointer);
      el.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  // prefers-reduced-motion parks the tour rather than removing it: the pause
  // button is a real control, so pressing play still runs it. Anything that
  // moves on its own is simply not the right default under that preference.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const park = (matches: boolean) => {
      if (matches) setPlaying(false);
    };
    park(media.matches);
    const onChange = (event: MediaQueryListEvent) => park(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    if (!playing || !inView || !tabVisible || view !== "graph") return;
    const timer = setTimeout(() => {
      const index = MARKETING_FEATURES.findIndex((f) => f.id === activeId);
      setActiveId(MARKETING_FEATURES[(index + 1) % MARKETING_FEATURES.length].id);
      setEngaged(true);
    }, TOUR_MS);
    return () => clearTimeout(timer);
  }, [playing, inView, tabVisible, view, activeId, tourToken]);

  const tourRunning = playing && inView && tabVisible && view === "graph";

  return (
    <section id="features" ref={sectionRef} className="relative z-10 pb-16 pt-6 lg:pt-8">
      {/* One column for the whole playground: headline, canvas, inspector, rail.
          Nothing floats out to a viewport edge, and the tree pane lands exactly
          where the canvas does. */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p
            className="mk-rise font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            style={{ animationDelay: "0ms" }}
          >
            Directory to graph, in the browser
          </p>
          <h1
            className="mk-rise mt-3 text-2xl font-bold leading-[1.12] tracking-tight sm:text-3xl lg:text-4xl"
            style={{ animationDelay: "80ms" }}
          >
            Turn any directory into an interactive graph
          </h1>
          <p
            className="mk-rise mt-3 max-w-xl text-base text-muted-foreground sm:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            Point it at a folder. Get a map you can drag, search and export.
          </p>
          <div className="mk-rise mt-5 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link href={APP_URL} className={buttonVariants({ variant: "default" })}>
              Launch the app
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/docs" className={buttonVariants({ variant: "outline" })}>
              Read the docs
            </Link>
          </div>
        </div>

        <div className="mt-8">
          {/* The View toolbar: the app's own controls, in the app's own chrome,
              above the thing they control. */}
          <div
            className="mk-panel flex flex-wrap items-center gap-3 px-3 py-2"
            role="group"
            aria-label="View"
          >
            <GripDots />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">View</span>
            <div
              role="group"
              aria-label="Choose a view"
              className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-1"
            >
              <button
                type="button"
                aria-pressed={view === "tree"}
                onClick={() => setView("tree")}
                className={tabClass(view === "tree")}
              >
                tree
              </button>
              <button
                type="button"
                aria-pressed={view === "graph"}
                onClick={() => setView("graph")}
                className={tabClass(view === "graph")}
              >
                fewer
              </button>
            </div>

            <span
              role="group"
              aria-label="Accent colour"
              className="ml-auto flex shrink-0 items-center gap-1.5"
            >
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  aria-label={`${swatch.name} accent`}
                  aria-pressed={accent === swatch.value}
                  onMouseEnter={() => setAccent(swatch.value)}
                  onFocus={() => setAccent(swatch.value)}
                  onClick={() => setAccent(swatch.value)}
                  className="h-3.5 w-3.5 cursor-pointer rounded-full border border-border/70 transition-transform duration-150 hover:scale-110"
                  style={{ background: swatch.value }}
                />
              ))}
            </span>
          </div>

          {/* Both panes stay mounted and stacked in one grid cell, so the height
              never jumps; the toggle only moves opacity. `invisible` keeps the
              hidden pane out of the tab order now that it holds pins.
              grid-cols-1 is minmax(0, 1fr): an auto column would size to the
              design box and drag the whole page wider than the viewport. */}
          <div id="compare" className="relative mt-3 grid grid-cols-1">
            <div
              style={{ gridArea: "1 / 1", transition: PANE_TRANSITION }}
              className={
                view === "tree"
                  ? "opacity-100 translate-y-0"
                  : "invisible pointer-events-none -translate-y-2 opacity-0"
              }
              aria-hidden={view !== "tree"}
            >
              {/* The same folder, as text: a captioned block the same size as
                  the canvas it swaps with, not a stray <pre> at a page edge.
                  `items-center` shrinks each child to its own text and centres
                  it, so the block reads as one centred column - the pre keeps
                  its lines left-aligned inside it, or the tree's │ columns
                  would stagger. */}
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 px-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  The same folder, as text
                </span>
                <pre className="m-0 max-w-full overflow-x-auto font-mono text-[13px] leading-6 text-muted-foreground">
                  {TREE_LINES.join("\n")}
                  <span className="mk-caret ml-0.5" aria-hidden="true" />
                </pre>
              </div>
            </div>

            <div
              style={{ gridArea: "1 / 1", transition: PANE_TRANSITION }}
              className={
                view === "graph"
                  ? "opacity-100 translate-y-0"
                  : "invisible pointer-events-none -translate-y-2 opacity-0"
              }
              aria-hidden={view !== "graph"}
            >
              <PreviewGraph
                className="w-full"
                accent={accent}
                shyness={shyness}
                activeTag={{ id: feature.id, nodeId: feature.anchor, label: feature.chip }}
                activeIds={feature.on}
                dimOthers={engaged && view === "graph"}
                onActivateNode={(nodeId, via) => {
                  // A card can demonstrate several features (the root folder
                  // carries four). Hover shows the first, so the reveal is
                  // immediate; a click walks the rest - and the tag the card
                  // wears is what tells a reader there is more behind it.
                  const anchored = MARKETING_FEATURES.filter((f) => f.anchor === nodeId);
                  if (anchored.length === 0) return;
                  if (via === "hover") {
                    activate(anchored[0].id, via);
                    return;
                  }
                  const i = anchored.findIndex((f) => f.id === activeId);
                  activate(anchored[(i + 1) % anchored.length].id, via);
                }}
              />
            </div>
          </div>

          {/* The inspector: one feature at a time, in the app's panel chrome.
              No close button - a dismissed card is a demo with nothing to say -
              and no link that promises an action it cannot perform. */}
          <div
            data-mk-callout={feature.id}
            aria-live={tourRunning ? "off" : "polite"}
            className="mk-panel mt-8 overflow-hidden"
          >
            <div className="mk-panel-bar">
              <GripDots />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Feature</span>
              <span
                className="ml-1 truncate font-mono text-[11px] uppercase tracking-[0.18em]"
                style={{ color: "var(--fewer-folder-icon)" }}
              >
                {feature.chip}
              </span>
              {feature.tier === "pro" && (
                <span
                  title="Needs a signed-in Pro account"
                  className="rounded-md border px-1.5 font-mono text-[10px] uppercase tracking-wider"
                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                >
                  Pro
                  <span className="sr-only">: needs a signed-in Pro account</span>
                </span>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <BarButton
                  label={tourRunning ? "Pause the feature tour" : "Play the feature tour"}
                  onClick={() => setPlaying((was) => !was)}
                  data-mk-tour={tourRunning ? "pause" : "play"}
                >
                  {tourRunning ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </BarButton>
                <BarButton label="Previous feature" onClick={() => step(-1)} data-mk-cycle="prev">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </BarButton>
                <span className="shrink-0 whitespace-nowrap px-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  <span aria-hidden="true">
                    {featureIndex + 1} / {MARKETING_FEATURES.length}
                  </span>
                  <span className="sr-only">
                    Feature {featureIndex + 1} of {MARKETING_FEATURES.length}
                  </span>
                </span>
                <BarButton label="Next feature" onClick={() => step(1)} data-mk-cycle="next">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </BarButton>
              </div>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {feature.headline}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">{feature.line}</p>
              </div>

              <FeatureProof
                kind={feature.proof}
                shyness={shyness}
                onShyness={(value) => {
                  setShyness(value);
                  setTourToken((token) => token + 1);
                }}
              />
            </div>
          </div>

          {/* The rail: what it does, in three groups of concrete chips. Each
              group's longer sentence lives on its label's tooltip, so the page
              never has to spell it out in the main flow. */}
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category) => (
              <div key={category.id}>
                <h3
                  className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                  title={category.tip}
                >
                  {category.label}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {category.features.map((id) => {
                    const item = MARKETING_FEATURES.find((f) => f.id === id)!;
                    const pressed = item.id === feature.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-mk-chip={item.id}
                        aria-pressed={pressed}
                        onClick={() => activate(item.id, "click")}
                        onMouseEnter={() => activate(item.id, "hover")}
                        onFocus={() => activate(item.id, "focus")}
                        className={[
                          "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-200",
                          pressed
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        {item.chip}
                        {item.tier === "pro" && (
                          <span
                            aria-hidden="true"
                            className="ml-1.5 rounded border px-1 text-[10px] uppercase tracking-wider opacity-80"
                          >
                            Pro
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 font-mono text-xs text-muted-foreground">
            {isTouch ? "Tap a card." : "Hover a card."} Every one is a feature.
            Step through them with the arrows, or let the tour run.
          </p>
        </div>
      </div>
    </section>
  );
}
