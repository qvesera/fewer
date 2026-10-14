"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "./MarketingLayout";
import { useDevice } from "@/hooks/use-device";
import { graphToTextLines } from "@/lib/fewer/marketingPreview";
import { MARKETING_FEATURES, previewPins } from "@/lib/fewer/marketingFeatures";
import { PreviewGraph } from "./PreviewGraph";
import { FeatureProof } from "./FeatureProof";

/**
 * The hero AND the feature story (T-150 follow-up, third pass).
 *
 * The canvas is the page: full-bleed, on the same dot grid the app draws, with
 * no browser chrome and no card around it. The two controls that would have
 * made it look like a screenshot - the tree/fewer toggle and the accent
 * swatches - are furniture the app itself has, so they ship as a floating
 * "View" panel over the canvas rather than as page UI, and the feature
 * explanation ships as an inspector panel: a real card with a title bar, the
 * feature's name in it, and a close button.
 *
 * No auto-advancing content: a tour that rewrote the callout on idle is what
 * forced a pause control onto the page, and a pause control is the wrong first
 * thing to show a visitor. Discovery is the pin ping, the card hover, the rail
 * and the keyboard - all user-initiated, none of them pointer-only.
 *
 * The rail is grouped by what the product calls things ("Arrange & edit", not
 * "Capabilities"), each group one short row of chips with its longer sentence
 * as the title tooltip: three words per feature to skim, the sentence on
 * demand, and nothing to read to use the page.
 */

const TREE_LINES = graphToTextLines();
const PINS = previewPins();

const PANE_TRANSITION =
  "opacity var(--dur-slow) var(--ease-enter), transform var(--dur-slow) var(--ease-enter)";

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

export function FeaturePlayground() {
  const [view, setView] = useState<View>("graph");
  const [accent, setAccent] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string>(MARKETING_FEATURES[0].id);
  const [dismissed, setDismissed] = useState(false);
  /**
   * Whether the reader has touched anything yet. At rest the graph is whole:
   * nothing dimmed, no pin pressed. Loading straight into a dimmed state made
   * the page look like it was already half-hovered, which is the one thing a
   * demo graph must not look like before anyone touches it.
   */
  const [engaged, setEngaged] = useState(false);
  const { isTouch } = useDevice();

  const feature = useMemo(
    () => MARKETING_FEATURES.find((f) => f.id === activeId) ?? MARKETING_FEATURES[0],
    [activeId],
  );

  /**
   * Every activation lights its hotspot. Hover never reopens the inspector
   * once the reader has closed it - a pointer crossing the canvas must not
   * undo that - but a click or a keyboard focus does, because those are
   * deliberate.
   */
  const activate = useCallback((id: string, via: "hover" | "click" | "focus" = "click") => {
    setActiveId(id);
    setEngaged(true);
    if (via !== "hover") {
      setDismissed(false);
      // A deliberate pick also leaves the tree pane, so the callout and the
      // canvas are talking about the same thing. Hover never steals the view.
      setView("graph");
    }
  }, []);

  return (
    <section id="features" className="relative z-10 pb-16 pt-6 lg:pt-8">
      {/* The bar: the headline and the two actions. Nothing else - the canvas
          controls live on the canvas. */}
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
      </div>

      {/* Full-bleed canvas. The right padding at lg+ is the View panel's lane,
          so the floating panel never lands on a card. */}
      <div className="relative mt-6 w-full px-2 sm:px-4 lg:pr-[300px]">
        {/* The View panel: the app's own controls, in the app's own furniture. */}
        <div
          className="mk-panel static mb-3 w-full max-w-sm lg:absolute lg:right-6 lg:top-0 lg:z-10 lg:mb-0"
          role="group"
          aria-label="View"
        >
          <div className="mk-panel-bar">
            <GripDots />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">View</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-3">
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
              className="flex shrink-0 items-center gap-1.5"
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
        </div>

        {/* Both panes stay mounted and stacked in one grid cell, so the height
            never jumps; the toggle only moves opacity. `invisible` keeps the
            hidden pane out of the tab order now that it holds pins.
            grid-cols-1 is minmax(0, 1fr): an auto column would size to the
            860px design box and drag the whole page wider than the viewport. */}
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
            <pre className="overflow-x-auto font-mono text-[13px] leading-6 text-muted-foreground">
              {TREE_LINES.join("\n")}
              <span className="mk-caret ml-0.5" aria-hidden="true" />
            </pre>
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
              pins={PINS}
              activePinId={engaged ? feature.id : null}
              activeIds={feature.on}
              dimOthers={engaged && view === "graph"}
              onActivateNode={(nodeId, via) => {
                // A card can carry several hotspots (the root folder carries
                // four). Hover shows the first, so the reveal is immediate;
                // a click walks the rest, which is how a reader reaches the
                // ones whose pins are easy to miss.
                const anchored = MARKETING_FEATURES.filter((f) => f.anchor === nodeId);
                if (anchored.length === 0) return;
                if (via === "hover") {
                  activate(anchored[0].id, via);
                  return;
                }
                const i = anchored.findIndex((f) => f.id === activeId);
                activate(anchored[(i + 1) % anchored.length].id, via);
              }}
              onActivatePin={(id, via) => activate(id, via)}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* The inspector: one feature at a time, in the app's panel chrome. */}
        {!dismissed && (
          <div
            data-mk-callout={feature.id}
            aria-live="polite"
            className="mk-panel mt-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"
          >
            <div className="mk-panel-bar lg:col-span-2">
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
              <button
                type="button"
                aria-label="Hide this panel"
                onClick={() => setDismissed(true)}
                className="ml-auto cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {feature.headline}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{feature.line}</p>
              <Link
                href={feature.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                Try it
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <FeatureProof kind={feature.proof} />
          </div>
        )}

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
          {isTouch ? "Tap a card or a pin." : "Hover a card or a pin."} Every one is a feature.
        </p>
      </div>
    </section>
  );
}
