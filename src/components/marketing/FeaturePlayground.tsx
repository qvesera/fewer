"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useDevice } from "@/hooks/use-device";
import { graphToTextLines } from "@/lib/fewer/marketingPreview";
import { MARKETING_CATEGORIES, MARKETING_FEATURES } from "@/lib/fewer/marketingFeatures";
import { PreviewGraph } from "./PreviewGraph";
import { FeatureProof } from "./FeatureProof";

/**
 * The hero AND the feature story (T-150 follow-up, fourth pass; selection
 * reworked T-151; the hero moved out into HeroRotator in T-161).
 *
 * The headline is now the screen above this one: this section opens on the
 * demo, so a reader arrives at the canvas rather than reading past it. What
 * stays here is the product's own furniture - on the same dot grid the app
 * draws, inside a frosted window chassis (T-158) whose title bar holds the
 * View controls, in the same column as the inspector and the rail - so
 * nothing is stranded at a viewport edge. The chassis is the product's own
 * furniture, not browser chrome: both panes (graph and tree text) live in
 * it, so the toggle reads as one window showing the folder two ways.
 *
 * The graph and the catalogue are one thing: a card's id IS the feature id
 * (marketingPreview.ts derives the tree from this catalogue), so activating a
 * card is `activate(nodeId)` - no anchor map asserting that some sample-project
 * file "demonstrates" a feature it has nothing to do with. Folder cards are
 * structure: they hold the group's features and activate nothing.
 *
 * One feature at a time, in that inspector. It advances two ways: the reader
 * (file card, chip, or the arrows in the title bar) and the tour, which walks
 * the catalogue every TOUR_MS while it can be seen and nobody has touched
 * anything. The pause button is real - and the tour starts parked under
 * prefers-reduced-motion, where anything that moves on its own is the wrong
 * default. While it runs the card is not announced; once the reader stops it,
 * aria-live takes over so keyboard and screen-reader users get the same card a
 * sighted reader parked.
 *
 * The rail is grouped by what the product calls things ("Shape it", not
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

/**
 * The comparison's annotation: the reader's hand-drawn squiggle
 * (public/squiggle.svg, inlined so the strokes can draw themselves) pointing
 * up at the View toggle, with the sentence beside it as real text. Decorative
 * and pointer-transparent - it teaches by pointing, the toggle is the control.
 * The loop draws first and the arrowhead lands after it, the first time the
 * section is on screen (one-way `entered`, so scrolling away and back cannot
 * replay it); under prefers-reduced-motion it is simply drawn. Below sm there
 * is no room beside the toggle to point at, so only the sentence shows.
 */
function CompareAnnotation({ entered }: { entered: boolean }) {
  return (
    <div
      data-mk-compare-hint
      className="pointer-events-none absolute -top-6 left-4 z-10 select-none sm:left-48"
      style={{ color: "var(--fewer-folder-icon)" }}
    >
      <div className="flex items-center gap-2">
        <svg
          className="mk-squiggle hidden h-[116px] w-[150px] shrink-0 sm:block"
          viewBox="0 0 67.352715 51.977543"
          data-drawn={entered ? "1" : "0"}
          aria-hidden="true"
        >
          <g transform="translate(-62.313375,-37.095948)">
            <path
              pathLength={1}
              d="M 128.66609,61.027395 C 119.61041,87.165189 99.81681,94.870779 87.883466,81.979512 73.694414,66.651466 96.384728,47.399694 105.22089,64.375662 120.47625,93.68414 54.576875,91.817572 68.910101,38.650684"
            />
            <path pathLength={1} d="m 63.313375,42.119016 5.708767,-4.02311 3.258942,5.191834" />
          </g>
        </svg>
        <span
          className="font-mono text-[12px] font-semibold"
          style={{ transform: "rotate(-2deg)" }}
        >
          see the difference!
        </span>
      </div>
    </div>
  );
}

export function FeaturePlayground() {
  /**
   * The demo opens on the text pane: the comparison is the point, so a
   * reader arrives on the ordinary `tree` their files already print as. The
   * coach mark (rendered inside the tree pane, gone once the reader has seen
   * the graph - `seenGraph`) is what invites the switch.
   */
  const [view, setView] = useState<View>("tree");
  /** One-way: the reader has been to the graph at least once this visit. */
  const [seenGraph, setSeenGraph] = useState(false);
  useEffect(() => {
    if (view === "graph") setSeenGraph(true);
  }, [view]);
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
   * nothing dimmed (the active ring still marks the feature on screen, but a
   * ring is a mark, not a mood). Loading straight into a dimmed state made
   * the page look like it was already half-hovered, which is the one thing a
   * demo graph must not look like before anyone touches it.
   */
  const [engaged, setEngaged] = useState(false);

  /* The tour: on by default, parked under reduced motion, restartable. */
  const [playing, setPlaying] = useState(true);
  /** Bumped by every reader activation: the quiet clock starts again from it. */
  const [tourToken, setTourToken] = useState(0);
  const [inView, setInView] = useState(false);
  /** One-way: the section has been on screen at least once, so the coach
   *  mark's arrow draws exactly once and never re-animates on re-entry. */
  const [entered, setEntered] = useState(false);
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
   * Every activation selects that feature and restarts the tour's clock, so a
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

  // The tour only runs where it can be seen: in view, with the tab in front,
  // and never under prefers-reduced-motion. It is not gated on the graph pane
  // - the inspector below cycles on the tree pane too, and it is what still
  // names each feature while the text view is up.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      setEntered(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      setInView(visible);
      if (visible) setEntered(true);
    });
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
    if (!playing || !inView || !tabVisible) return;
    const timer = setTimeout(() => {
      const index = MARKETING_FEATURES.findIndex((f) => f.id === activeId);
      setActiveId(MARKETING_FEATURES[(index + 1) % MARKETING_FEATURES.length].id);
      setEngaged(true);
    }, TOUR_MS);
    return () => clearTimeout(timer);
  }, [playing, inView, tabVisible, activeId, tourToken]);

  const tourRunning = playing && inView && tabVisible;

  return (
    <section
      id="features"
      ref={sectionRef}
      className="relative z-10 scroll-mt-[var(--mk-header-h)] pb-12 pt-14"
    >
      {/* One column for the whole playground: canvas, inspector, rail. Nothing
          floats out to a viewport edge, and the tree pane lands exactly where
          the canvas does. The headline is one screen above (T-161), so this
          opens with a sentence that names what the reader is looking at - it
          is the phrase the hero deliberately does not use, kept here for the
          reader who came looking for it. */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything fewer does
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A folder opened as an interactive graph: hover a card, or use the rail below, to
            read each feature.
          </p>
        </div>

        {/* The chassis (T-158): the canvas wears the app window's own clothes
            - frosted glass, a title bar holding the View controls, an inner
            top highlight and a deep shadow that samples the chosen accent.
            Both panes live inside it, so tree and graph read as two views of
            one window rather than two components swapped on the page. */}
        <div
          className="mk-chassis mt-8 overflow-hidden rounded-2xl"
          style={accent ? ({ "--mk-accent": accent } as CSSProperties & Record<string, string>) : undefined}
        >
          {/* The View controls, in the window's title bar. */}
          <div
            className="mk-chassis-bar flex-wrap"
            role="group"
            aria-label="View"
          >
            <GripDots />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">View</span>
            <div
              role="group"
              aria-label="Choose a view"
              className={[
                "inline-flex rounded-lg border border-border/60 bg-muted/30 p-1",
                // The toggle glows once when the section lands on screen, to
                // pull the eye to the control the coach mark is about.
                entered && !seenGraph ? "mk-compare-nudge" : "",
              ].join(" ")}
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
              hidden pane out of the tab order now that it holds interactive
              cards.
              grid-cols-1 is minmax(0, 1fr): an auto column would size to the
              design box and drag the whole page wider than the viewport. */}
          <div id="compare" className="relative grid grid-cols-1">
            <div
              style={{ gridArea: "1 / 1", transition: PANE_TRANSITION }}
              className={
                view === "tree"
                  ? "opacity-100 translate-y-0"
                  : "invisible pointer-events-none -translate-y-2 opacity-0"
              }
              aria-hidden={view !== "tree"}
            >
              {/* The squiggle points up into the title bar from the pane
                  itself, so it lives on the pane, not in the centred column -
                  `seenGraph` retires it for the rest of the visit once the
                  reader has compared. The pane's own `invisible` hides it
                  with everything else when the graph is up. */}
              {view === "tree" && !seenGraph && <CompareAnnotation entered={entered} />}
              {/* The same folder, as text: a captioned block the same size as
                  the canvas it swaps with, not a stray <pre> at a page edge.
                  `items-center` shrinks each child to its own text and centres
                  it, so the block reads as one centred column - the pre keeps
                  its lines left-aligned inside it, or the tree's │ columns
                  would stagger. */}
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 px-6 py-10">
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
                className="w-full p-2"
                accent={accent}
                shyness={shyness}
                activeId={feature.id}
                dimOthers={engaged && view === "graph"}
                onActivateNode={(nodeId, via) => {
                  // The card id IS the feature id, so activation is a lookup
                  // by identity. Folder cards (root and the three groups) are
                  // structure, not features, and activate nothing. The hover
                  // still happened though, so the authorisation it carried is
                  // spent here: leaving it armed lets the next synthetic
                  // pointerover (a layout shift under a parked pointer, the
                  // exact case the authorisation exists to filter) activate
                  // whatever card happens to land under the cursor.
                  if (!MARKETING_FEATURES.some((f) => f.id === nodeId)) {
                    if (via === "hover") hoverAuthorised.current = false;
                    return;
                  }
                  activate(nodeId, via);
                }}
              />
            </div>
          </div>

          {/* The inspector: one feature at a time, in the app's panel chrome.
              No close button - a dismissed card is a demo with nothing to say -
              and no link that promises an action it cannot perform. */}
          <div className="mk-panel mt-8 overflow-hidden">
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

            {/* The live region is the card's copy only - the bar above and the
                rail below are chrome and buttons. Ten chips re-announcing
                themselves on every tour tick would be noise, not news. */}
            <div
              data-mk-callout={feature.id}
              aria-live={tourRunning ? "off" : "polite"}
              className="grid gap-5 px-5 py-4 sm:gap-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-center"
            >
              <div className="min-w-0">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {MARKETING_CATEGORIES.find((c) => c.features.includes(feature.id))?.label}
                </span>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {feature.headline}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{feature.line}</p>
              </div>

              {/* The proof gets its own framed cell: without the rule the
                  150px band (sized by the tallest proof) reads as dead air
                  beside a two-line block. */}
              <div className="lg:border-l lg:border-border/60 lg:pl-6">
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

            {/* The rail is the card's footer band: it takes the body's own
                inset, so the group headings line up with the headline instead
                of hanging on the card's border - and nothing floats under the
                card. Each group's longer sentence stays on its label tooltip,
                so the page still never has to spell it out in the main flow. */}
            {/* Three groups, three or four chips each: even columns keep every
                group to one or two rows, and the longest group ("Shape it",
                four) sets how many. */}
            <div className="grid gap-x-8 gap-y-5 border-t border-border/60 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {MARKETING_CATEGORIES.map((category) => (
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
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
