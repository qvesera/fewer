---
title: Theming
description: Customize Fewer's appearance with built-in light/dark modes, 18 theme presets, and a custom color editor with per-color opacity.
---

Fewer has been designed with a dual color theme in mind. It comes with a light and dark theme, both of which are customizable, plus 18 hand-tuned presets and a full custom theme editor.

## Theme Modes

Fewer supports three theme modes:

- **Light** — default light interface
- **Dark** — dark interface
- **Custom** — user-defined color palette

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

- **Canvas & Text** — background, primary/secondary text, hover, handles, edges
- **Folders** — body, text, secondary text, border, icon
- **Files** — body, text, secondary text, border, icon

### Per-Color Opacity

Each color has an independent opacity slider with live preview swatch. The editor uses a full `HexAlphaColorPicker` with gradient panel, hue strip, and alpha channel.

### Draggable & Minimizable

The editor is a movable panel locked within the browser window. Click the minimize (−) button to collapse it into a small draggable dock pill that snaps to any canvas edge (top/bottom/left/right). The pill renders vertically on side edges. Click the pill to restore.

### 15 CSS Color Variables

| Variable            | Purpose              |
| ------------------- | -------------------- |
| `--background`      | Main background      |
| `--foreground`      | Main text color      |
| `--card`            | Node card background |
| `--card-foreground` | Node card text       |
| `--border`          | Borders, dividers    |
| `--primary`         | Accent color, links  |
| `--secondary`       | Secondary surfaces   |
| `--muted`           | Subtle backgrounds   |
| `--accent`          | Hover states         |
| `--folder-bg`       | Folder card specific |
| `--folder-border`   | Folder card border   |
| `--file-bg`         | File card specific   |
| `--file-border`     | File card border     |
| `--edge-color`      | Graph edge color     |
| `--edge-highlight`  | Selected edge color  |

### Per-Type Text Controls

Folder and file cards each have separate text controls:

- **Folder text** — title color
- **Folder secondary text** — path and footer color
- **File text** — filename color
- **File secondary text** — extension and size color

## Aurora Haze Tokens

Version 0.2.5 introduces motion tokens for consistent transitions:

```css
--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1);
--dur-aurora: 200ms;
```

These power sidebar hover states, expand animations, and UI transitions.

## Edge Styles

Three edge styles available:

1. **Curved** — smooth bezier curves
2. **Angled** — sharp corners with configurable radius
3. **Straight** — direct lines

Adjust via sidebar Edges section or cycle with layout controls.

## Edge Motion

Optional motion effects:

- **None** — static edges
- **Flow** — animated dash offset
- **Pulse** — animated stroke opacity

## Edge Pattern & Weight

In Power User mode, the sidebar Edges section also controls:

- **Pattern** — solid, dashed, or dotted
- **Line Thickness** — 0.5px to 6px slider
- **Corner Radius** — 0-20px for angled edges

## Next Steps

- [Settings](/docs/settings) — Power User mode and node dimensions
- [Graph Features](/docs/graph-features) — canvas, layout, and edge behavior
