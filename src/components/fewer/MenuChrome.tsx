"use client";

import type { InfoRow, MenuHeader } from "@/lib/fewer/menuInfo";

/**
 * Chrome shared by every canvas context menu.
 *
 * Plain divs, not Radix `Label`s: the card menus render through `ContextMenu`
 * and the canvas-positioned ones (edge, background, selection) through
 * `DropdownMenu`, so a component that imported either primitive would force the
 * other side to keep its own copy — which is how the four menus drifted apart
 * in the first place. Both menus ignore non-item children for keyboard
 * navigation, so these never steal a press.
 */

/**
 * Title (what was right-clicked) plus a muted subtitle (where it sits / what it
 * holds). Truncated, never wrapped: a long path must not grow the menu.
 */
export function MenuHeader({ header }: { header: MenuHeader }) {
  return (
    <div data-slot="menu-header" className="px-2 pt-1 pb-1.5">
      <div className="truncate text-sm font-medium text-foreground">{header.title}</div>
      {header.subtitle && (
        <div className="truncate text-2xs text-muted-foreground" title={header.subtitle}>
          {header.subtitle}
        </div>
      )}
    </div>
  );
}

/** Read-only label/value rows for a Details submenu. */
export function MenuInfoRows({ rows }: { rows: InfoRow[] }) {
  return (
    <div data-slot="menu-info-rows" className="space-y-0.5 px-2 py-1.5" aria-label="Details">
      {rows.map((row) => (
        <div key={row.id} className="flex items-baseline gap-2 text-2xs leading-snug">
          <span className="w-14 shrink-0 text-muted-foreground">{row.label}</span>
          <span className="truncate text-foreground/90" title={row.value}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
