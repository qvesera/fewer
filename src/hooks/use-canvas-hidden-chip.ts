import { useMemo } from "react";
import { canvasChipStyle, type CanvasChipStyle } from "@/lib/fewer/themeColors";

/** Read the --fewer-background CSS custom property and derive the chip style. */
export function useCanvasHiddenChip(): CanvasChipStyle {
  return useMemo(() => {
    const rawBackground =
      typeof document === "undefined"
        ? undefined
        : getComputedStyle(document.documentElement)
            .getPropertyValue("--fewer-background")
            .trim();
    return canvasChipStyle(rawBackground || undefined);
  }, []);
}
