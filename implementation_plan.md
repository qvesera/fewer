# Implementation Plan

## Overview

Implement the design system from `design-system/fewer/MASTER.md` across the fewer app, updating colors, fonts, spacing, shadows, and component styles to match the luxury/premium Quantum cyan + interference purple brand specification. Uses Google Fonts alternatives (Inter for headings, DM Sans for body) since Satoshi is commercial.

## Types

No type changes needed. Existing `CustomTheme` interface in `src/lib/fewer/types.ts` already supports all theme colors - full revamp applies to default values, not theme system itself.

## Files

### New Files
- `src/app/fonts.ts` - Google Fonts configuration: Inter (heading) + DM Sans (body)
- `src/styles/design-system.css` - Design system CSS variables (luxury palette)

### Modified Files
- `src/app/globals.css` - Replace Geist fonts, update CSS variables to luxury palette
- `src/app/layout.tsx` - Import and apply new fonts
- `tailwind.config.ts` - Add new color tokens from design system
- `src/lib/fewer/types.ts` - Update `DEFAULT_CUSTOM_THEME` to luxury palette
- `src/components/ui/button.tsx` - Add `.btn-primary` variants (magenta + cyan)
- `src/components/ui/card.tsx` - Apply `.card` design system styles
- `src/components/ui/input.tsx` - Apply `.input` design system styles
- `src/components/ui/dialog.tsx` - Apply `.modal` design system styles
- `src/components/fewer/Sidebar.tsx` - Apply luxury glass morphism classes
- `src/components/fewer/CustomNode.tsx` - Align with luxury variables
- `src/components/fewer/GraphCanvas.tsx` - Apply background theme
- `src/components/fewer/BreadcrumbBar.tsx` - Apply glass morphism

## Functions

### New Functions
- None (CSS-only changes)

### Modified Functions
- None (CSS variable propagation via Tailwind theme)

## Classes

### CSS Classes to Add
- `.btn-primary` - Magenta background (#FF00FF) with hover lift
- `.btn-secondary` - Cyan border (#00FFFF) with hover lift
- `.card` - Glass morphism with shadow-md elevation
- `.input` - Cyan focus ring with smooth transition
- `.modal-overlay` - Blur backdrop with dark overlay
- `.modal` - White/center card with shadow-xl

### CSS Classes to Update
- Replace `.gm-glass` background values with design system colors
- Replace `.gm-float` background values with design system colors
- Update `.gm-selected-glow` to use `#00FFFF` (cyan) instead of `#22d3ee`
- Update scrollbar colors to use `--color-muted`

## Dependencies

### New Packages
- None (uses existing `@next/font/google`)

### Font URLs
- Google Fonts: Inter (weight 700) + DM Sans (weights 400,500,700)

## Testing

Verify changes by:
1. Running `npm run dev`
2. Check font rendering on all pages
3. Verify color contrast meets 4.5:1 ratio
4. Test dark/light theme switches
5. Test glass morphism on different backgrounds
6. Verify responsive breakpoints (375px, 768px, 1024px, 1440px)

## Implementation Order

1. Create `src/app/fonts.ts` with Inter + DM Sans font definitions
2. Create `src/styles/design-system.css` with all CSS variables and utility classes
3. Update `src/app/layout.tsx` to import and apply new fonts
4. Update `src/app/globals.css` - merge design system variables with existing
5. Update `tailwind.config.ts` - add brand color tokens
6. Update `src/lib/fewer/types.ts` - sync DEFAULT_CUSTOM_THEME with MASTER.md
7. Update `src/components/ui/button.tsx` - add design system button variants
8. Update `src/components/ui/card.tsx` - apply card styles
9. Update `src/components/ui/input.tsx` - apply input focus styles
10. Update `src/components/ui/dialog.tsx` - apply modal overlay styles
11. Update `src/components/fewer/Sidebar.tsx` - apply glass morphism classes
12. Update `src/components/fewer/CustomNode.tsx` - align with design system variables
13. Update remaining components (GraphCanvas, BreadcrumbBar, etc.)
14. Run visual tests and adjust as needed