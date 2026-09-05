---
title: Theming
description: Customize Fewer's appearance with built-in light/dark modes, 18 theme presets, and a custom color editor with per-color opacity.
---

Fewer has been designed with a dual color theme in mind. It comes with a light and dark theme, both of which are customizable, plus 18 hand-tuned presets and a full custom theme editor.

## Theme Modes

Fewer supports three theme modes:

- **Light**: default light interface
- **Dark**: dark interface
- **Custom**: user-defined color palette

Switch themes via Settings → Appearance tab or use the theme toggle in the sidebar.

## Built-in Themes

### Light

- Background: `#ffffff`
- Foreground: `#0a0a0b`
- Folder cards: orange palette
- File cards: purple palette

### Dark

- Background: `#0a0a0b`
- Foreground: `#f4f4f5`
- Folder cards: orange palette
- File cards: purple palette

## Theme Presets

18 popular open source theme presets are built in:

Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark, One Light, GitHub Light, GitHub Dark, Material, and more.

Each preset is hand-tuned with Open Color values for consistent, accessible contrast. Select a preset from the dropdown in the Custom Theme Editor.

## Custom Theme Editor

Access via Settings → Appearance → Custom Theme (Power User mode only).

### Sections

Colors are grouped into three sections:

- **Canvas & Text**: background, primary/secondary text, hover, handles, edges
- **Folders**: body, text, secondary text, border, icon
- **Files**: body, text, secondary text, border, icon

### Per-Color Opacity

Each color has an independent opacity slider with live preview swatch. The editor uses a full `HexAlphaColorPicker` with gradient panel, hue strip, and alpha channel.

### Draggable & Minimizable

The editor is a movable panel locked within the browser window. Click the minimize (−) button to collapse it into a small draggable dock pill that snaps to any canvas edge (top/bottom/left/right). The pill renders vertically on side edges. Click the pill to restore.

### 17 CSS Color Variables

All theme colors are exposed as `--fewer-*` CSS variables:

| Variable                     | Purpose                    |
| ---------------------------- | -------------------------- |
| `--fewer-background`         | Canvas background          |
| `--fewer-text`               | Main text color            |
| `--fewer-text-subtle`        | Secondary/subtle text      |
| `--fewer-item-hover`         | Hover state background     |
| `--fewer-handle`             | Connection handle color    |
| `--fewer-edge`               | Graph edge color           |
| `--fewer-select-ring`        | Selected node outline      |
| `--fewer-folder-bg`          | Folder card background     |
| `--fewer-folder-border`      | Folder card border         |
| `--fewer-folder-text`        | Folder title color         |
| `--fewer-folder-subtle-text` | Folder path/footer color   |
| `--fewer-folder-icon`        | Folder icon/accent color   |
| `--fewer-file-bg`            | File card background       |
| `--fewer-file-text`          | File name color            |
| `--fewer-file-subtle-text`   | File extension/size color  |
| `--fewer-file-border`        | File card border           |
| `--fewer-file-icon`          | File icon/accent color     |
| `--fewer-background-gradient` | Canvas background gradient (only when enabled, else unset) |
| `--fewer-folder-bg-gradient`  | Folder card background gradient (only when enabled, else unset) |
| `--fewer-file-bg-gradient`    | File card background gradient (only when enabled, else unset) |

### Gradients

Canvas background, folder body, and file body slots support an optional
two-stop **linear gradient**. Expand the slot in the Custom Theme Editor and
click **Add** under *Gradient* to enable it — a second color picker lets you
choose the endpoint, and the slider sets the angle. Click **On** again to
remove it.

Gradient-capable slots expose a `-gradient` companion CSS variable alongside
the solid `--fewer-*` variable. UI surfaces opt in explicitly:

```css
/* e.g. the canvas — falls back to the solid color when no gradient set */
background: var(--fewer-background-gradient, var(--fewer-background));
```

**Note:** the main `--fewer-*` variable always stays a solid color, so features
that take a single color — the minimap, SVG/PNG export, saved-theme preview
dots — render the solid start color even when a gradient is configured. Only
the in-app canvas and node card backgrounds render gradients.

Editing a slot's base color (via the main picker or hex input) preserves its
gradient — the gradient endpoint and angle are kept.

### Per-Section Undo

Each section header (**Canvas & Text**, **Folders**, **Files**) has an undo
button that reverts that section's slots to their state before the last burst
of edits. A picker drag coalesces into a single undo step. Applying a preset,
loading a saved theme, or resetting are all undoable per-section. History is
session-scoped (it survives opening/closing the editor, but not a page reload).

Folder and file cards each have separate text controls:

- **Folder text**: title color
- **Folder secondary text**: path and footer color
- **File text**: filename color
- **File secondary text**: extension and size color

## Aurora Haze Tokens

Motion tokens for consistent transitions:

```css
--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1);
--dur-aurora: 200ms;
```

These power sidebar hover states, expand animations, and UI transitions.

## Edge Styles

Three edge styles available:

1. **Curved**: smooth bezier curves
2. **Angled**: sharp corners with configurable radius
3. **Straight**: direct lines

Adjust via sidebar Edges section or cycle with layout controls.

## Edge Motion

Optional motion effects:

- **None**: static edges
- **Flow**: animated dash offset
- **Pulse**: animated stroke opacity

## Edge Pattern & Weight

In Power User mode, the sidebar Edges section also controls:

- **Pattern**: solid, dashed, or dotted
- **Line Thickness**: 0.5px to 6px slider
- **Corner Radius**: 0-20px for angled edges

## Next Steps

- [Settings](/docs/settings): Power User mode and node dimensions
- [Graph Features](/docs/graph-features): canvas, layout, and edge behavior
