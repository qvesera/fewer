"use client";

import { useState } from "react";
import { PreviewGraph } from "./PreviewGraph";

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

export function HeroCanvas() {
  const [accent, setAccent] = useState<string | undefined>(undefined);

  return (
    <figure className="m-0">
      <div className="rounded-2xl border border-border/60 bg-card/50 p-3 shadow-2xl backdrop-blur-sm">
        <figcaption className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            fewer/ · sample project
          </span>
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
        </figcaption>
        <PreviewGraph accent={accent} />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        The real canvas, reduced: hover a card, pick an accent.
      </p>
    </figure>
  );
}
