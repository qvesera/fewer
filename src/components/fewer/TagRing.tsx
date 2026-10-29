"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { lumaHex } from "@/lib/fewer/themeColors";
import {
  buildTagRingGradient,
  colorForTag,
  tagRingColors,
  TAG_RING_CAP,
  TAG_RING_WIDTH,
  type Tag,
} from "@/lib/fewer/tags";

/** Letter colour for an initials chip: dark on a light tag, white on a dark
 *  one — the 128 luma split the theme already uses for card text. */
function chipTextColor(color: string): string {
  return (lumaHex(color) ?? 0) > 128 ? "#111827" : "#ffffff";
}

/**
 * Tag highlight ring for a node card. Rendered INSIDE the card (which is
 * `position: relative`) as an absolutely-positioned overlay — never as a
 * wrapper. A wrapper breaks React Flow's node ref (context menus die) and a
 * padded background bleeds through translucent card bodies. The `.gm-tag-ring`
 * mask keeps only the TAG_RING_WIDTH band around the border painted, so a
 * multi-tag card shows hard-edged color steps around its outline and nothing
 * else. The band width is applied inline (below) from that shared constant.
 *
 * Hidden while the card is selected: the themed selection ring wins.
 */
export function TagRing({
  tags,
  tagIds,
  selected,
  width,
  height,
}: {
  tags: Tag[];
  /** Tag ids assigned to this node, in display order. */
  tagIds: string[];
  selected: boolean;
  /** Card dimensions — split the ring equally by outline length, so odd tag
   * counts stay even on wide (folder/file) cards. Optional: falls back to an
   * equal-angle split when the node isn't measured yet. */
  width?: number;
  height?: number;
}) {
  // The shared ring contract (tags.ts) — the same helper the SVG/PNG exporter
  // paints from, so the two can never disagree about which tags show, or in
  // what order. Both drop unpaintable colors before applying the cap, and both
  // remap through the colour-blind-safe palette when that preference is on.
  const colorBlindSafe = useGraphStore((s) => s.a11y.colorBlindSafe);
  const colors = useMemo(() => tagRingColors(tags, tagIds, colorBlindSafe), [
    tagIds,
    tags,
    colorBlindSafe,
  ]);

  if (selected || colors.length === 0) return null;

  return (
    <div
      className="gm-tag-ring"
      style={{
        // Band width comes from the shared constant, so the visible band and the
        // exported ring stroke can't drift apart. `.gm-tag-ring` owns the rest.
        inset: -TAG_RING_WIDTH,
        padding: TAG_RING_WIDTH,
        background:
          width && height
            ? buildTagRingGradient(colors, { width, height })
            : buildTagRingGradient(colors),
      }}
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
  const colorBlindSafe = useGraphStore((s) => s.a11y.colorBlindSafe);
  const initials = useGraphStore((s) => s.a11y.tagInitials);
  return (
    <span className={cn("flex items-center gap-1", className)} title={tagIds.map((id) => tags.find((t) => t.id === id)?.label ?? id).join(", ")}>
      {shown.map((id) => {
        const color = colorForTag(tags, id, colorBlindSafe);
        if (!initials) {
          return (
            <span
              key={id}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40"
              style={{ background: color }}
            />
          );
        }
        // Initials mode: a 14px chip (pitch 18 with gap-1) — the same geometry
        // the exporter paints, so tagDotsWidth budgets match on both sides.
        const label = tags.find((t) => t.id === id)?.label ?? "";
        return (
          <span
            key={id}
            className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-2xs font-semibold leading-none ring-1 ring-white/40"
            style={{ background: color, color: chipTextColor(color) }}
          >
            {label.slice(0, 1).toUpperCase()}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-2xs font-semibold text-muted-foreground/70">
          +{overflow}
        </span>
      )}
    </span>
  );
}
