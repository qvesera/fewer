"use client";

import { useState } from "react";
import { graphToTextLines } from "@/lib/fewer/marketingPreview";
import { PreviewGraph } from "./PreviewGraph";

type View = "tree" | "graph";

const TREE_LINES = graphToTextLines();

const PANE_TRANSITION = "opacity var(--dur-slow) var(--ease-enter), transform var(--dur-slow) var(--ease-enter)";

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

function tabClass(active: boolean) {
  return [
    "cursor-pointer rounded-md px-4 py-1.5 font-mono text-sm transition-colors duration-200",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

/**
 * The comparison that sells the product in one gesture (T-150): the same tree,
 * as `tree` output and as the canvas. Both panes stay mounted and stack in one
 * grid cell, so the container height never jumps between views. This is the
 * page's only copy of the sample graph (e2e pins the region count), so the
 * accent swatches live up here rather than in a second hero instance.
 */
export function TextVsGraph() {
  const [view, setView] = useState<View>("graph");
  const [accent, setAccent] = useState<string | undefined>(undefined);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <div className="mt-6 grid rounded-2xl border border-border/60 bg-card/40 p-5 shadow-xl backdrop-blur-sm">
        <div
          style={{ gridArea: "1 / 1", transition: PANE_TRANSITION }}
          className={
            view === "tree"
              ? "opacity-100 translate-y-0"
              : "pointer-events-none -translate-y-2 opacity-0"
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
              ? "flex min-w-0 items-center opacity-100 translate-y-0"
              : "pointer-events-none min-w-0 -translate-y-2 opacity-0"
          }
          aria-hidden={view !== "graph"}
        >
          <PreviewGraph className="w-full" accent={accent} />
        </div>
      </div>
    </div>
  );
}
