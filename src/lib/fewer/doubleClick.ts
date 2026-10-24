/**
 * What a double-click on a card means (T-214). Pure and testable — the hook
 * only wires the three outcomes to the OS opener, the preview panel and the
 * zoom-to-fit.
 *
 * Desktop app: a FILE opens in the operating system's default application
 * (that's the point of a file viewer); folders zoom; a file that only exists
 * inside an expanded archive is not a real path, so it zooms instead of
 * pretending. Alt+click keeps the licensed in-app preview reachable.
 */
export interface DoubleClickContext {
  /** Inside a desktop shell (native opener available). */
  host: boolean;
  /** The canvas's data source; only a real disk folder has paths on disk. */
  dataSource: string | null;
  altKey: boolean;
  /** Pro in-app preview (tier) — currently off in the shipped shell. */
  previewLicensed: boolean;
}

export interface DoubleClickTarget {
  data: { type: string; path?: string; isArchive?: boolean };
}

export function doubleClickIntent(
  target: DoubleClickTarget,
  ctx: DoubleClickContext,
): "open" | "preview" | "zoom" {
  if (target.data.type !== "file") return "zoom";
  if (ctx.altKey && ctx.host && ctx.previewLicensed && target.data.path) return "preview";
  if (
    ctx.host &&
    ctx.dataSource === "directory" &&
    !!target.data.path &&
    !target.data.isArchive
  ) {
    return "open";
  }
  return "zoom";
}