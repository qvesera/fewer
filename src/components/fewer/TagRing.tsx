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
 * Tag highlight ring for a node card. Rendered INSIDE the card (which is
 * `position: relative`) as an absolutely-positioned overlay — never as a
 * wrapper. A wrapper breaks React Flow's node ref (context menus die) and a
 * padded background bleeds through translucent card bodies. The `.gm-tag-ring`
 * mask keeps only the 3px band around the border painted, so a multi-tag card
 * shows hard-edged color steps around its outline and nothing else.
 *
 * Hidden while the card is selected: the themed selection ring wins.
 */
export function TagRing({
  tags,
  tagIds,
  selected,
}: {
  tags: Tag[];
  /** Tag ids assigned to this node, in display order. */
  tagIds: string[];
  selected: boolean;
}) {
  const colors = useMemo(
    () => tagIds.map((id) => colorForTag(tags, id)).filter(Boolean),
    [tagIds, tags],
  );

  if (selected || colors.length === 0) return null;

  return (
    <div
      className="gm-tag-ring"
      style={{ background: buildTagRingGradient(colors) }}
      aria-hidden="true"
    />
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
