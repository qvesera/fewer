// Pure helpers for ExportPanel — export logic extracted from useMemo blocks.
import type { FewerNode } from "@/lib/fewer/types";

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
