# Implementation Plan

[Overview]
Consolidate scattered utility controls (bug report, keyboard shortcuts, power user toggle, about, theme, minimap) into a single tabbed Settings Dialog accessible via a gear icon on the top-right of the CanvasToolbar, decluttering the Sidebar and GlobalNavbar.

The Sidebar currently has 8 collapsible sections — too crowded. The GlobalNavbar has 6 icon buttons crammed into the right cluster. This plan creates a unified `SettingsDialog` with tabbed sections (About, Appearance, Advanced, Help) that absorbs the Configuration section from the Sidebar and the utility buttons from GlobalNavbar/Toolbar. The Settings button lives on the far right of `CanvasToolbar`, following the universal gear-icon convention. Existing dialogs (`BugReportDialog`, `ShortcutsDialog`) remain as standalone components but are triggered from within the Settings dialog's Help tab. The `PowerUserToggle` component is embedded directly in the Advanced tab. Theme controls (light/dark/custom) move from the Sidebar's Appearance section into the Settings dialog's Appearance tab. Minimap controls move from Sidebar to Settings → Advanced tab. This reduces the Sidebar to 4-5 core sections (File & Actions, Layout & Edges, Hidden Nodes, Graph Analytics) and reduces GlobalNavbar to just search + notifications + settings.

[Types]

Single sentence: Add `settingsOpen` boolean and `setSettingsOpen` action to the UI slice; no new domain types needed.

```typescript
// Addition to src/store/slices/uiSlice.ts — UiSliceCreator type block
settingsOpen: boolean;
setSettingsOpen: (open: boolean) => void;

// Addition to createUiSlice initial state
settingsOpen: false,

// Addition to createUiSlice actions
setSettingsOpen: (open) => set({ settingsOpen: open }),
```

No other type changes required. The Settings dialog reuses existing store state: `themeMode`, `setThemeMode`, `showFiles`, `setShowFiles`, `advancedModeEnabled`, `setAdvancedMode`, `showMiniMap`, `setShowMiniMap`, `miniMapPosition`, `setMiniMapPosition`, `miniMapSize`, `setMiniMapSize`, `bugReportOpen`, `setBugReportOpen`, `shortcutsOpen`, `setShortcutsOpen`, `tutorialDismissed`, `resetTutorial`.

[Files]

Single sentence: One new component file, four existing files modified, zero deletions.

**New Files:**

| File | Purpose |
|------|---------|
| `src/components/fewer/SettingsDialog.tsx` | Tabbed settings dialog with About, Appearance, Advanced, Help tabs. ~350 lines. Uses existing `Dialog` + `Tabs` shadcn primitives. Embeds `PowerUserToggle`, `CustomThemeEditor`, and `MinimapControls` (extracted from Sidebar). Triggers `BugReportDialog` and `ShortcutsDialog` via store actions. |

**Modified Files:**

| File | Changes |
|------|---------|
| `src/store/slices/uiSlice.ts` | Add `settingsOpen: boolean` state + `setSettingsOpen` action (3 insertions in type block, initial state, and action body) |
| `src/components/fewer/CanvasToolbar.tsx` | Add `Settings` (gear) icon button on far-right after Export button. Wire to `setSettingsOpen(true)`. Import `Settings` from lucide-react. |
| `src/components/fewer/Sidebar.tsx` | Remove the "Configuration" `CollapsibleSection` (lines 894-897) containing `PowerUserToggle`. Remove the "Appearance" section's theme mode buttons + custom theme editor (lines 833-854) — keep only the "Show files" toggle. Remove the "Minimap" `AnimatedConditional` + `CollapsibleSection` (lines 888-892). Remove `MinimapControls` function definition (lines 312-379) — move to `SettingsDialog.tsx`. Remove unused imports: `Sun`, `Moon`, `Palette`, `Settings2`, `Maximize2`, `Map as MinimapIcon`. Remove unused store selectors: `themeMode`, `setThemeMode`, `showMiniMap`, `setShowMiniMap`, `miniMapPosition`, `setMiniMapPosition`, `miniMapSize`, `setMiniMapSize`. |
| `src/components/fewer/GlobalNavbar.tsx` | Remove the `Keyboard`, `Bug`, `Github`, `Globe` buttons (lines 84-140). Remove `onRestartTutorial` prop and its button. Remove unused imports: `Bug`, `HelpCircle`, `Keyboard`, `Github`, `Globe`. Remove `setBugReportOpen` store selector. The navbar becomes: Logo + Search + Notifications only. |
| `src/components/fewer/FewerApp.tsx` | Add `<SettingsDialog />` to the dialog stack (after `<ShortcutsDialog />`). Remove `onRestartTutorial` prop from `<GlobalNavbar>`. |
| `src/components/fewer/index.ts` | Add `export { SettingsDialog } from "./SettingsDialog";` |

[Functions]

Single sentence: One new component function, several modified functions for removal/wiring.

**New Functions:**

| Function | File | Signature | Purpose |
|----------|------|-----------|---------|
| `SettingsDialog` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | Main settings dialog component. Reads `settingsOpen`/`setSettingsOpen` from store. Renders `Dialog` with `Tabs` (About, Appearance, Advanced, Help). Each tab is an inline sub-component. |
| `AboutTab` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | App version, description, links to GitHub/website, credits. Static content. |
| `AppearanceTab` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | Theme mode selector (light/dark/custom), `CustomThemeEditor` when custom, "Show files" toggle. Reads `themeMode`, `setThemeMode`, `showFiles`, `setShowFiles` from store. |
| `AdvancedTab` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | `PowerUserToggle` component, `MinimapControls` component (moved from Sidebar), node dimension sliders (moved from Sidebar "Node Metrics" section). |
| `HelpTab` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | Buttons to open `ShortcutsDialog` (via `setShortcutsOpen(true)`), `BugReportDialog` (via `setBugReportOpen(true)`), restart tutorial (via `resetTutorial()` + local state key), link to GitHub issues, link to website. |
| `MinimapControls` | `src/components/fewer/SettingsDialog.tsx` | `() => JSX.Element` | Moved verbatim from Sidebar.tsx lines 312-379. Same store selectors. |

**Modified Functions:**

| Function | File | Changes |
|----------|------|---------|
| `CanvasToolbar` | `src/components/fewer/CanvasToolbar.tsx` | Add `setSettingsOpen` selector. Add gear icon `Button` after Export button in right cluster. |
| `Sidebar` | `src/components/fewer/Sidebar.tsx` | Remove Configuration section, Appearance theme controls, Minimap section, Node Metrics section. Remove `MinimapControls` helper. Remove unused imports and selectors. |
| `GlobalNavbar` | `src/components/fewer/GlobalNavbar.tsx` | Remove `onRestartTutorial` prop, remove Keyboard/Bug/Github/Globe buttons. Simplify to Logo + Search + Notifications. |
| `FewerApp` | `src/components/fewer/FewerApp.tsx` | Remove `onRestartTutorial` from `<GlobalNavbar>`. Add `<SettingsDialog />` to dialog stack. |

**Removed Functions:**

| Function | File | Reason | Migration |
|----------|------|--------|-----------|
| `MinimapControls` | `src/components/fewer/Sidebar.tsx` | Moved to SettingsDialog | Redefined in `SettingsDialog.tsx` |

[Classes]

Single sentence: No class modifications — this codebase is functional/React-based.

[Dependencies]

Single sentence: No new dependencies required.

All required primitives already exist:
- `Dialog` — `@/components/ui/dialog` (Radix UI)
- `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` — `@/components/ui/tabs` (Radix UI)
- `Switch` — `@/components/ui/switch`
- `Slider` — `@/components/ui/slider`
- `Button` — `@/components/ui/button`
- `Label` — `@/components/ui/label`
- Icons — `lucide-react` (Settings, Sun, Moon, Palette, Bug, Keyboard, Github, Globe, HelpCircle, Map, Maximize2, Info)

[Testing]

Single sentence: Manual testing via dev server + quality gates.

**Manual Test Cases:**
1. Click gear icon on CanvasToolbar → Settings dialog opens with About tab active
2. Switch to Appearance tab → theme buttons work (light/dark/custom), custom theme editor appears when custom selected, Show files toggle works
3. Switch to Advanced tab → Power User toggle works, minimap controls work, node dimension sliders work
4. Switch to Help tab → "View Keyboard Shortcuts" button opens ShortcutsDialog, "Report a Bug" button opens BugReportDialog, "Restart Tutorial" button resets tutorial, GitHub/website links open in new tab
5. Close Settings dialog → all state persists (theme, power user, minimap settings)
6. Sidebar no longer shows Configuration, Minimap, or theme mode sections
7. GlobalNavbar no longer shows Keyboard/Bug/GitHub/Globe buttons
8. Power User toggle in Settings still controls advanced features in Sidebar (Layout directions, edge motion, etc.)
9. Mobile: Settings dialog is responsive (tabs scroll horizontally, content scrolls vertically)
10. Keyboard: Tab navigation works through all settings controls, Escape closes dialog

**Quality Gates:**
```bash
npm run lint && npm run build
```

[Implementation Order]

1. Add `settingsOpen` state + `setSettingsOpen` action to `src/store/slices/uiSlice.ts`
2. Create `src/components/fewer/SettingsDialog.tsx` with all four tabs (About, Appearance, Advanced, Help), including moved `MinimapControls`
3. Add `SettingsDialog` export to `src/components/fewer/index.ts`
4. Add gear icon button to `src/components/fewer/CanvasToolbar.tsx` right cluster
5. Add `<SettingsDialog />` to `src/components/fewer/FewerApp.tsx` dialog stack
6. Remove Configuration/Appearance-theme/Minimap/NodeMetrics sections from `src/components/fewer/Sidebar.tsx`, remove `MinimapControls` function, clean unused imports/selectors
7. Remove Keyboard/Bug/GitHub/Globe buttons + `onRestartTutorial` prop from `src/components/fewer/GlobalNavbar.tsx`, clean unused imports
8. Remove `onRestartTutorial` from `<GlobalNavbar>` in `src/components/fewer/FewerApp.tsx`
9. Run `npm run lint && npm run build` — fix any errors
10. Update `CHANGELOG.md` with entry for settings dialog feature