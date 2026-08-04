---
title: "Theming"
description: "Customize Fewer's appearance with built-in light/dark modes, custom color themes, and Aurora Haze design tokens."
---

# Theming

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

## Custom Theme Editor

Access via Settings → Appearance → Custom Theme.

15 CSS color variables exposed:

| Variable | Purpose |
|----------|---------|
| `--background` | Main background |
| `--foreground` | Main text color |
| `--card` | Node card background |
| `--card-foreground` | Node card text |
| `--border` | Borders, dividers |
| `--primary` | Accent color, links |
| `--secondary` | Secondary surfaces |
| `--muted` | Subtle backgrounds |
| `--accent` | Hover states |
| `--folder-bg` | Folder card specific |
| `--folder-border` | Folder card border |
| `--file-bg` | File card specific |
| `--file-border` | File card border |
| `--edge-color` | Graph edge color |
| `--edge-highlight` | Selected edge color |

## Aurora Haze Tokens

Version 0.3.4 introduces motion tokens for consistent transitions:

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