---
title: Accessibility
description: The Accessibility tab in Settings — interface scale, contrast, colour vision, motion, hit targets, focus, and what the canvas announces for screen readers.
---

The gear icon in the top navbar opens **Settings → Accessibility**. Every control there is available to every signed-in or guest user on every screen size — accessibility is never behind a plan, a Power User mode or a viewport.

## Interface scale

One multiplier for the whole interface: **Auto / 100% / 125% / 150%**. Text, spacing, icons and corner radii scale together, so labels grow without anything clipping around them.

- **Auto** follows your window: 100% below 2000px wide, 112% from 2000px, 125% from 3000px — a big screen starts readable without you hunting for a setting.
- An explicit choice is stored with your other settings (localStorage, plus the cloud when signed in) and applied before the first paint, so reloading never flashes back to Auto.
- Browser zoom still works on top of it, and the type floor is 11px everywhere either way.

## Vision

- **High contrast** hardens borders, muted text and card sub-lines so text stands apart from its surface. Your operating system's **increased contrast** preference turns the same treatment on without you touching this switch.
- **Solid surfaces** removes the blur and translucency behind dialogs, menus and panels, so nothing behind the text moves while you read it. The OS **reduced transparency** preference does the same on its own.

## Colour vision

- **Colour-blind-safe tag palette** repaints tags from the Okabe-Ito hues — the reference set for red-green and blue-yellow colour vision — instead of the default rainbow, whose first five colours collapse into one band for dichromatic viewers. It is applied while painting, never to the stored colour: turn it off and your original colours come straight back. Exports follow it automatically.
- **Show tag initials** puts each tag's first letter in its chip, so tags stay tellable apart with no colour information at all. Exported images show the same letters.

The **Custom Theme Editor** shows a live WCAG ratio on every colour slot that has a meaningful counterpart (4.5:1 for text, 3:1 for icons and borders), with a **Fix** button that applies the smallest adjustment that clears the threshold. The edit goes through the editor's normal per-section undo.

## Motion

- **Reduce motion** stops animations — marching connections, node entrances, transitions — whether or not your system asks for reduced motion. The OS setting keeps working on its own; this switch lets you force it (or keep it off even when the OS asks, by leaving it off).

## Pointer & focus

- **Larger hit targets** raises the button height floor and widens the invisible hit area around small controls.
- **Stronger focus ring** draws a heavier outline on keyboard focus, and on plain focus too, so a click-then-tab reader never lands on a control with no visible marker.

## What the canvas says

- The workspace is a `<main>` landmark and the **Skip to main content** link (first on the page when you press Tab) jumps straight into it.
- Moving the selection with the arrow keys announces the card through a polite live region: name, kind, level, child count, root/dimmed/collapsed flags and tags — for example `src, folder, level 2, 12 children, tags backend`. Selecting several cards announces the count instead.

## Related

- [Settings](/docs/settings) — where these controls live and what else the dialog contains
- [Themes](/docs/theming) — the Custom Theme Editor and its contrast chips
