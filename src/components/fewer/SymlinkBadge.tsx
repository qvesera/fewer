"use client";

import type { SymlinkInfo } from "@/lib/fewer/types";
import { symlinkAriaLabel, symlinkBadgeText, symlinkTooltip } from "@/lib/fewer/symlinkDisplay";
import { cn } from "@/lib/utils";

/**
 * The "↷ → target" chip that marks a symlink card. One component, three
 * placements: the expanded-card header line (chip), the collapsed-pill subtitle
 * and the child rows inside a parent card (inline, no background).
 *
 * Tooltip carries the raw target + resolved path; the badge text is the
 * truncated basename (external links are flagged, broken links warn).
 */
export function SymlinkBadge({
  info,
  variant = "chip",
  className,
}: {
  info: SymlinkInfo;
  variant?: "chip" | "inline";
  className?: string;
}) {
  return (
    <span
      title={symlinkTooltip(info)}
      aria-label={symlinkAriaLabel(info)}
      className={cn(
        "truncate",
        info.broken ? "text-amber-500 dark:text-amber-400" : "text-fewer-text-subtle",
        variant === "chip" && "inline-flex min-w-0 max-w-full items-center gap-1 text-[10px]",
        variant === "inline" && "shrink-0 text-[10px]",
        className,
      )}
    >
      {symlinkBadgeText(info)}
    </span>
  );
}