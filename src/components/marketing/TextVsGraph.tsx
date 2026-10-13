"use client";

import { useState } from "react";
import { graphToTextLines } from "@/lib/fewer/marketingPreview";
import { PreviewGraph } from "./PreviewGraph";

type View = "tree" | "graph";

const TREE_LINES = graphToTextLines();

const PANE_TRANSITION = "opacity var(--dur-slow) var(--ease-enter), transform var(--dur-slow) var(--ease-enter)";

function tabClass(active: boolean) {
  return [
    "cursor-pointer rounded-md px-4 py-1.5 font-mono text-sm transition-colors duration-200",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  ].join(" ");
}

/**
 * The comparison that sells the product in one gesture (T-150): the same tree,
 * as `tree` output and as the canvas. Both panes stay mounted and stack in one
 * grid cell, so the container height never jumps between views.
 */
export function TextVsGraph() {
  const [view, setView] = useState<View>("graph");

  return (
    <div className="mt-10">
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
          <PreviewGraph className="w-full" />
        </div>
      </div>
    </div>
  );
}
