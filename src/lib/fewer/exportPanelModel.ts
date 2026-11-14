// Pure helpers for ExportPanel — export logic extracted from useMemo blocks.
import type { FewerNode } from "@/lib/fewer/types";

/**
 * T-222: the persisted control is `quality`, but what it actually decides is
 * the raster's pixel scale (`quality / 50`, never below 1×). The panel shows
 * the scale and the exporter reads it, so both sides go through these two
 * helpers — one mapping, one place to reason about it. The slider's range is
 * 50–100 (1×–2×): below 50 the scale was already pinned at 1×, so those
 * positions were dead travel. Old stored values below 50 still read as 1×.
 */
export const QUALITY_MIN = 50;
export const QUALITY_MAX = 100;

/** Pixels per canvas pixel: 50 → 1×, 100 → 2×. Never below 1×. */
export function qualityToScale(quality: number): number {
  return Math.max(1, quality / 50);
}

/** Inverse of `qualityToScale`, clamped to the slider's range. */
export function scaleToQuality(scale: number): number {
  const quality = Math.round(scale * 50);
  return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, quality));
}

/** Display form: "1", "1.5", "1.75" — never a float tail. */
export function formatScale(scale: number): string {
  return String(Math.round(scale * 100) / 100);
}

/** A lone file node has no descendants — block "export selection" for non-image formats. */
export function isSingleFileSelected(
  selectedNodeIds: string[],
  format: string,
  nodes: FewerNode[],
): boolean {
  const isImage = format === "png" || format === "svg";
  return !isImage
    && selectedNodeIds.length === 1
    && nodes.some((n) => n.id === selectedNodeIds[0] && n.data.type === "file");
}

/** Is the current format an advanced-only one? */
export function isAdvancedFormatOnly(format: string, advancedFormatValues: readonly string[]): boolean {
  return advancedFormatValues.some((v) => v === format);
}

/**
 * File extension for the script exports in the export panel: `.bat` on
 * Windows (cmd.exe), `.sh` elsewhere (bash).
 */
export function scriptFileExt(isWindows: boolean): ".bat" | ".sh" {
  return isWindows ? ".bat" : ".sh";
}

/**
 * Desc shown next to "Export Folders" in the export panel:
 * "Folder structure (.bat)" / "Folder structure (.sh)".
 */
export function folderFormatDesc(isWindows: boolean): string {
  return `Folder structure (${scriptFileExt(isWindows)})`;
}

/**
 * Desc shown next to "Export Changes" in the export panel:
 * "Replay your edits (.bat)" / "Replay your edits (.sh)".
 */
export function changesFormatDesc(isWindows: boolean): string {
  return `Replay your edits (${scriptFileExt(isWindows)})`;
}
