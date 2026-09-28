import type { SymlinkInfo } from "./types";

/**
 * Display helpers for symlink metadata — one source of truth shared by the
 * canvas (CustomNode) and the vector exporter (graphRenderer) so both render
 * the same badge text and tooltip.
 */

/** Basename of the link target ("../v012" → "v012"); no Node `path` import —
 *  this module also runs in the browser. Handles both separators. */
function targetBase(t: string): string {
  const trimmed = t.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** Basename of the link target, or the whole target when it is not a path. */
export function symlinkTargetLabel(info: SymlinkInfo): string {
  const t = info.target || "";
  return targetBase(t) || t || "?";
}

/** One-line badge: "↷ v012", "↷ v012 (external)" or "⚠ broken → v012". */
export function symlinkBadgeText(info: SymlinkInfo): string {
  const label = symlinkTargetLabel(info);
  if (info.broken) return `⚠ broken → ${label}`;
  return `↷ ${label}${info.insideTree === false ? " (external)" : ""}`;
}

/** Full tooltip text: raw target, plus the resolved absolute path when the raw value is relative or differs. */
export function symlinkTooltip(info: SymlinkInfo): string {
  const parts = [`symlink → ${info.target}`];
  if (info.resolvedPath && info.resolvedPath !== info.target) {
    parts.push(`resolves to ${info.resolvedPath}`);
  }
  if (info.insideTree === false) parts.push("target is outside the imported tree");
  if (info.broken) parts.push("target does not exist (dangling link)");
  return parts.join(" · ");
}

/** aria-label for a link card ("symlink to v012"). */
export function symlinkAriaLabel(info: SymlinkInfo): string {
  return `symlink to ${symlinkTargetLabel(info)}`;
}
