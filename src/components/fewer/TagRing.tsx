"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildTagRingGradient,
  colorForTag,
  TAG_RING_CAP,
  type Tag,
} from "@/lib/fewer/tags";

/**
 * Conic-gradient highlight ring drawn BEHIND a node card. Always present when
 * the node has tags and the node is NOT selected (selection draws its own ring
 * on the card, so we hide this one to avoid a double ring).
 *
 * The ring is a thin padded wrapper: the padded border shows the conic gradient
 * while the inner card paints over the rest. `rounded` must match the card's
 * border-radius for the ring to read as a continuous outline.
 */
export function TagRing({
  tags,
  tagIds,
  selected,
  rounded = "rounded-2xl",
  thickness = 3,
  children,
}: {
  tags: Tag[];
  /** Tag ids assigned to this node, in display order. */
  tagIds: string[];
  selected: boolean;
  rounded?: string;
  thickness?: number;
  children: React.ReactNode;
}) {
  const colors = useMemo(
    () => tagIds.map((id) => colorForTag(tags, id)).filter(Boolean),
    [tagIds, tags],
  );

  if (selected || colors.length === 0) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn("relative", rounded)}
      style={{ padding: thickness, background: buildTagRingGradient(colors) }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/**
 * Compact row of assignment dots shown on a card corner. Each dot is a tag's
 * color; overflow collapses to a "+N" pill. Purely informational — full
 * assignment happens in the context menu.
 */
export function TagDots({
  tags,
  tagIds,
  className,
}: {
  tags: Tag[];
  tagIds: string[];
  className?: string;
}) {
  const shown = tagIds.slice(0, TAG_RING_CAP);
  const overflow = tagIds.length - shown.length;
  return (
    <span className={cn("flex items-center gap-1", className)} title={tagIds.map((id) => tags.find((t) => t.id === id)?.label ?? id).join(", ")}>
      {shown.map((id) => (
        <span
          key={id}
          className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40"
          style={{ background: colorForTag(tags, id) }}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] font-semibold text-muted-foreground/70">
          +{overflow}
        </span>
      )}
    </span>
  );
}

export { TAG_RING_CAP };
