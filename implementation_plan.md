# Implementation Plan

[Overview]
Overhaul the theme system so that the dark theme is visually cohesive, the custom theme is fully functional and correctly maps each labeled color to its responsible CSS variable, and every custom color supports a per-color opacity control.

Currently the theme system has three modes (light, dark, custom) but the custom theme editor is half-baked: the `CustomTheme` type contains legacy fields (`nodeBg`, `nodeBorder`, `headerBg`, `headerText`, `icon`, `accent`) that are never consumed, while the UI labels in `CustomThemeEditor` are only loosely connected to the actual CSS variables used in `CustomNode.tsx` and `globals.css`. The result is that changing a color in the custom editor often does not affect the part of the UI the user expects. The dark theme also has poor contrast because it uses a near-black canvas with the same saturated orange/purple folder/file colors from the light theme. This plan redefines the color contract, fixes the variable wiring, adds per-color opacity, refreshes the dark palette, and ensures theme state is restored correctly after reload.

[Types]
Redefine `CustomTheme` so each color is a structured `{ color: hex, opacity: number }` instead of a plain CSS string, and keep the legacy fields only as a deprecated migration layer so existing saved states do not break. Dark-mode defaults should be chosen from the Open Color palette (https://github.com/yeun/open-color) for better contrast and saturation balance.

```ts
// src/lib/fewer/types.ts
export interface CustomThemeColor {
  color: string;   // hex, e.g. #fd7e14
  opacity: number; // 0..1
}

export interface CustomTheme {
  background: CustomThemeColor;
  defaultText: CustomThemeColor;
  subtleText: CustomThemeColor;
  itemHover: CustomThemeColor;
  handle: CustomThemeColor;
  edge: CustomThemeColor;
  // Folder colors
  folderBg: CustomThemeColor;
  folderBorder: CustomThemeColor;
  folderHeaderBg: CustomThemeColor;
  folderHeaderText: CustomThemeColor;
  folderIcon: CustomThemeColor;
  // File colors
  fileBg: CustomThemeColor;
  fileBorder: CustomThemeColor;
  fileIcon: CustomThemeColor;
  // Legacy fields retained for runtime migration from old plain-string schema
  nodeBg?: string;
  nodeBorder?: string;
  headerBg?: string;
  headerText?: string;
  icon?: string;
  accent?: string;
}

export type ThemeMode = "light" | "dark" | "custom";

export interface ThemeColorMeta {
  key: keyof Omit<CustomTheme, "nodeBg" | "nodeBorder" | "headerBg" | "headerText" | "icon" | "accent">;
  label: string;
  cssVar: string;
  description: string; // shown as a tooltip/label hint in the editor
  defaultColor: string;
  defaultOpacity: number;
  /** Open Color palette used for this slot in the dark theme. */
  openColor: { family: string; index: number };
}

export const THEME_COLOR_META: ThemeColorMeta[] = [
  { key: "background", label: "Canvas Background", cssVar: "--fewer-background", description: "Graph canvas background", defaultColor: "#0b0b13", defaultOpacity: 1, openColor: { family: "black", index: 0 } },
  { key: "defaultText", label: "Primary Text", cssVar: "--fewer-text", description: "Node titles and file names", defaultColor: "#f8f9fa", defaultOpacity: 1, openColor: { family: "gray", index: 0 } },
  { key: "subtleText", label: "Secondary Text", cssVar: "--fewer-text-subtle", description: "Paths, sizes, and meta text", defaultColor: "#adb5bd", defaultOpacity: 1, openColor: { family: "gray", index: 5 } },
  { key: "itemHover", label: "Child Row Hover", cssVar: "--fewer-item-hover", description: "Hover background on folder children", defaultColor: "#adb5bd", defaultOpacity: 0.15, openColor: { family: "gray", index: 5 } },
  { key: "handle", label: "Connection Handle", cssVar: "--fewer-handle", description: "React Flow handle dots", defaultColor: "#868e96", defaultOpacity: 1, openColor: { family: "gray", index: 6 } },
  { key: "edge", label: "Edge Line", cssVar: "--fewer-edge", description: "Default connection lines", defaultColor: "#adb5bd", defaultOpacity: 0.5, openColor: { family: "gray", index: 5 } },
  { key: "folderBg", label: "Folder Body", cssVar: "--fewer-folder-bg", description: "Main folder card background", defaultColor: "#fd7e14", defaultOpacity: 0.12, openColor: { family: "orange", index: 6 } },
  { key: "folderBorder", label: "Folder Border", cssVar: "--fewer-folder-border", description: "Folder card outline", defaultColor: "#fd7e14", defaultOpacity: 0.45, openColor: { family: "orange", index: 6 } },
  { key: "folderHeaderBg", label: "Folder Header", cssVar: "--fewer-folder-header-bg", description: "Folder title bar background", defaultColor: "#fd7e14", defaultOpacity: 0.25, openColor: { family: "orange", index: 6 } },
  { key: "folderHeaderText", label: "Folder Header Text", cssVar: "--fewer-folder-header-text", description: "Folder title and footer text", defaultColor: "#ffd8a8", defaultOpacity: 1, openColor: { family: "orange", index: 3 } },
  { key: "folderIcon", label: "Folder Icon", cssVar: "--fewer-folder-icon", description: "Folder/root icon color", defaultColor: "#ffa94d", defaultOpacity: 1, openColor: { family: "orange", index: 4 } },
  { key: "fileBg", label: "File Body", cssVar: "--fewer-file-bg", description: "File card background", defaultColor: "#be4bdb", defaultOpacity: 0.18, openColor: { family: "grape", index: 6 } },
  { key: "fileBorder", label: "File Border", cssVar: "--fewer-file-border", description: "File card outline", defaultColor: "#be4bdb", defaultOpacity: 0.45, openColor: { family: "grape", index: 6 } },
  { key: "fileIcon", label: "File Icon", cssVar: "--fewer-file-icon", description: "File type icon color", defaultColor: "#e599f7", defaultOpacity: 1, openColor: { family: "grape", index: 4 } },
];

export const DEFAULT_CUSTOM_THEME: CustomTheme = Object.fromEntries(
  THEME_COLOR_META.map((m) => [m.key, { color: m.defaultColor, opacity: m.defaultOpacity }])
) as CustomTheme;
```

Validation rules:
- `color` must be a 7-character hex string (`#rrggbb`). Empty or malformed values fall back to the default for that key.
- `opacity` is clamped to `[0, 1]`.
- The legacy fields are ignored at runtime but kept in the interface for one migration cycle.

Open Color integration: the default custom/dark theme values above are sourced from Open Color (gray, orange, grape). A small static map (`OPEN_COLOR`) can be embedded in `themeColors.ts` so the editor can offer preset swatches per color slot without adding a network dependency.

[Files]
Modify the type system, store, editor, node rendering, and global styles; add a small utility module for color conversion; and update the theme init script so it re-applies custom theme variables after reload.

New files:
- `src/lib/fewer/themeColors.ts` — helper functions: `toCssColor(color, opacity)`, `hexToRgb(hex)`, `migrateCustomTheme(theme)`, `clampOpacity(n)`.

Existing files to modify:
- `src/lib/fewer/types.ts` — redefine `CustomTheme`, `THEME_COLOR_META`, and `DEFAULT_CUSTOM_THEME` as described above.
- `src/store/slices/themeSlice.ts` — change the slice state to use the new `CustomThemeColor` shape; import `toCssColor` and `migrateCustomTheme` from `themeColors.ts`; apply CSS variables using the helper; add localStorage persistence for `customTheme` under a new key `fewer-custom-theme`; on load, migrate any legacy plain-string values.
- `src/app/layout.tsx` — update the inline `theme-init` script: after reading `fewer-theme`, if the mode is `custom`, read `fewer-custom-theme` and apply the variables before first paint to avoid FOUC. The script should also keep the `.dark`/`.light` class logic for light and dark modes.
- `src/components/fewer/CustomThemeEditor.tsx` — rewrite the color picker to show a hex input, native color picker, and an opacity slider per row; render a live preview square that reflects the final `rgba` output; group rows by purpose (Canvas, Text, Folder, File) with small section labels.
- `src/components/fewer/CustomNode.tsx` — fix the wiring so node text uses `--fewer-text`, node meta text uses `--fewer-text-subtle`, child row hover uses `--fewer-item-hover`, folder header uses `--fewer-folder-header-bg`, etc. Remove any hard-coded `text-foreground`/`text-muted-foreground` usage that should be theme-driven.
- `src/app/globals.css` — update the dark mode palette (`:root` is already light; `.dark` is the target) to lower saturation and improve contrast. Keep the same CSS variable names but change the default values inside `.dark` and add a few extra utility variables used only for the selected-node glow so they can be themed later (e.g. `--fewer-selection-glow`). Keep light-mode defaults untouched.
- `src/components/fewer/ThemeProvider.tsx` — on mount, re-apply the stored custom theme if `themeMode` is `custom`; ensure it reads `fewer-custom-theme` from localStorage and calls the same injection helper as the slice.
- `src/components/fewer/SettingsDialog.tsx` — no structural change, but verify that the theme buttons still trigger `setThemeMode` and that the custom editor is rendered only in `custom` mode.
- `src/components/fewer/GraphCanvas.tsx` — update the `nodeColor` and `nodeStrokeColor` callbacks used by the minimap so they derive from the current CSS variables (using `getComputedStyle` or theme state) instead of hard-coded `rgba(249, 115, 22, 0.7)` / `rgba(168, 85, 247, 0.7)`. Also update the default edge stroke and the background dot color to respect the active theme.
- `src/lib/fewer/share.ts` — optionally include `customTheme` in `ShareData` and encode/decode it so shared links preserve custom palettes. This is safe because the rest of the graph payload already includes the theme mode.

Files to delete or move:
- None. The legacy fields stay in the type for migration.

[Functions]
Add utility functions and modify store/theme-related functions to work with the new color shape.

New functions (in `src/lib/fewer/themeColors.ts`):
- `hexToRgb(hex: string): { r: number; g: number; b: number } | null` — parses `#rrggbb`.
- `toCssColor(color: string, opacity: number): string` — returns hex if opacity is 1, otherwise `rgba(r, g, b, opacity)`. Falls back to the default color for the key if the hex is invalid (this overload is not used; invalid input is handled by callers).
- `clampOpacity(opacity: number): number` — clamps to `[0, 1]` with two decimal precision.
- `migrateCustomTheme(input: unknown): CustomTheme` — takes a possibly legacy custom theme object and returns a valid `CustomTheme` where every key is a `CustomThemeColor`; fills missing/legacy values from `DEFAULT_CUSTOM_THEME`.

Modified functions:
- `createThemeSlice.setThemeMode` in `src/store/slices/themeSlice.ts` — persist `fewer-custom-theme` when switching to custom; read it when initializing; always call the DOM injection helper so the transition is immediate.
- `createThemeSlice.setCustomTheme` in `src/store/slices/themeSlice.ts` — accept `Partial<CustomTheme>` (with color/opacity shapes) and persist the result to `localStorage` after applying.
- `createThemeSlice.resetCustomTheme` in `src/store/slices/themeSlice.ts` — reset to `DEFAULT_CUSTOM_THEME` and persist.
- `applyCustomThemeToDOM` in `src/store/slices/themeSlice.ts` — change signature to `applyCustomThemeToDOM(theme: CustomTheme)` and iterate over `THEME_COLOR_META` using `toCssColor(theme[meta.key].color, theme[meta.key].opacity)`.
- `clearCustomThemeFromDOM` in `src/store/slices/themeSlice.ts` — unchanged behavior, but ensure it is only called when leaving custom mode.
- `ThemeProvider` useEffect in `src/components/fewer/ThemeProvider.tsx` — re-apply stored custom theme after reading `fewer-theme`; if `stored === "custom"`, call the DOM injection helper (or import the same logic from `themeColors.ts`) instead of just toggling `.dark`.
- `ColorPicker` component in `src/components/fewer/CustomThemeEditor.tsx` — accept `value: CustomThemeColor`, emit `onChange({ color, opacity })`, add an opacity slider, and render the computed color in the preview square.
- `CustomNodeImpl` rendering in `src/components/fewer/CustomNode.tsx` — replace hard-coded `text-foreground`/`text-muted-foreground` with `text-fewer-text`/`text-fewer-text-subtle` where appropriate; ensure the folder header background, border, and icon use the `fewer-folder-*` variables; ensure file card uses `fewer-file-*` variables.
- `CanvasInner` in `src/components/fewer/GraphCanvas.tsx` — read `--fewer-edge`, `--fewer-folder-bg`, `--fewer-file-bg`, and background dot color from `getComputedStyle(document.documentElement)` when theme changes, so the minimap and edges follow the custom theme without hard-coded colors.

Removed functions:
- None.

[Classes]
No class changes; this is a functional theme refactor, not a class-level refactor.

[Dependencies]
Add `open-color` as a runtime dependency to provide the official color palette JSON instead of embedding it manually. The refactor also uses the browser's native `<input type="color">`, `getComputedStyle`, and existing project utilities. No UI component libraries are added.

- `package.json`: add `"open-color": "^1.9.1"` to `dependencies`.
- `src/lib/fewer/themeColors.ts`: import `open-color.json` and build the `OPEN_COLOR` map from it; use the same map for default values and editor swatches.

[Testing]
Add a small Node test file for the color helper and perform manual visual QA for the three themes.

- `src/lib/fewer/themeColors.test.ts` (or `__tests__/themeColors.test.ts` if the project prefers that layout) — tests for `hexToRgb`, `toCssColor`, `clampOpacity`, and `migrateCustomTheme`. Use Node's built-in `node:test` runner so no extra test framework is required. If the project already has a test runner, conform to that instead; if not, add `npm test` to `package.json` that runs `node --test src/lib/fewer/themeColors.test.ts`.
- Manual QA checklist:
  1. Start the app with `npm run dev`.
  2. Load the sample tree and switch between light, dark, and custom themes in Settings → Appearance.
  3. In custom mode, change each color + opacity and confirm the preview square and the canvas update immediately and correctly.
  4. Verify that "Folder Body" changes the folder card background, "Folder Header" changes only the title bar, "File Body" changes file cards, "Primary Text" changes labels, and "Secondary Text" changes paths/sizes.
  5. Reload the page and confirm the custom theme is restored without a flash of the wrong palette.
  6. Run `npm run lint` and `npm run build` and fix any errors.

[Implementation Order]
1. Create `src/lib/fewer/themeColors.ts` with helper functions and `migrateCustomTheme`.
2. Update `src/lib/fewer/types.ts` with the new `CustomTheme`/`ThemeColorMeta` shapes and `DEFAULT_CUSTOM_THEME`.
3. Update `src/store/slices/themeSlice.ts` to use the new shape, persist/load custom theme, and apply variables via `toCssColor`.
4. Update `src/components/fewer/ThemeProvider.tsx` and `src/app/layout.tsx` to re-apply the stored custom theme on hydration without FOUC.
5. Update `src/components/fewer/CustomThemeEditor.tsx` with per-color opacity and a corrected preview.
6. Update `src/components/fewer/CustomNode.tsx` to use the theme variables consistently.
7. Update `src/app/globals.css` dark-mode defaults for better contrast.
8. Update `src/components/fewer/GraphCanvas.tsx` to read dynamic theme colors for edges and minimap.
9. Optionally update `src/lib/fewer/share.ts` to include `customTheme` in share payloads.
10. Add `src/lib/fewer/themeColors.test.ts` and run the test + lint + build.
11. Update `CHANGELOG.md` and commit.
