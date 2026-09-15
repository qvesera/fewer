import type { CustomTheme } from "./types";

/**
 * Representative color chips for a gallery theme card, pulled from the theme
 * JSON. Invalid/missing slots are dropped so a broken upstream value can never
 * crash the gallery grid.
 */
export function swatchColors(theme: CustomTheme): string[] {
  const chips = [
    theme?.background?.color,
    theme?.folderIcon?.color ?? theme?.folderBg?.color,
    theme?.fileIcon?.color ?? theme?.fileBg?.color,
    theme?.defaultText?.color,
  ];
  return chips.filter((c): c is string => typeof c === "string" && /^#?[0-9a-fA-F]{6}$/.test(c));
}

/** Display title for a gallery item — the gallery title wins over the theme name. */
export function galleryDisplayTitle(title: string, name: string): string {
  return title.trim() || name;
}

/** Gallery card author line: "Name · @username" when both exist, else a fallback. */
export function galleryAuthorLine(authorName: string, authorUsername: string): string {
  if (authorUsername) return `${authorName || "?"} · @${authorUsername}`;
  return authorName || "Anonymous";
}