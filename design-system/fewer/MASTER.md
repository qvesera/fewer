# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** fewer
**Generated:** 2026-07-17 17:29:16 (updated 2026-08-07)
**Category:** Aurora Haze / Glassmorphism

---

## Global Rules

### Color Palette

| Role          | Hex                                  | CSS Variable          |
| ------------- | ------------------------------------ | --------------------- |
| Primary       | `#f97316`                            | `--color-primary`     |
| Brand Fuchsia | `#ff00ff`                            | `--brand-fuchsia-500` |
| Brand Purple  | `#a855f7`                            | `--brand-purple-500`  |
| Brand Cyan    | `#22d3ee`                            | `--brand-cyan-400`    |
| Brand Amber   | `#ffbf00`                            | `--brand-amber-500`   |
| Brand Orange  | `#ff8c00`                            | `--brand-orange-500`  |
| Background    | `#ffffff` (light) / `#0b0b13` (dark) | `--fewer-background`  |
| Foreground    | `#1e293b` (light) / `#f8f9fa` (dark) | `--fewer-text`        |
| Folder Icon   | `#f97316` (light) / `#ffa94d` (dark) | `--fewer-folder-icon` |
| File Icon     | `#9333ea` (light) / `#e599f7` (dark) | `--fewer-file-icon`   |

**Color Notes:** Warm orange primary + Aurora Haze brand accents (fuchsia/cyan/purple). Dark mode uses Open Color palette (gray/orange/grape families).

### Typography

- **Heading Font:** Satoshi (`--font-heading`)
- **Body Font:** General Sans (`--font-body`)
- **Mood:** warm, atmospheric, premium, modern, clean, sophisticated
- **Google Fonts:** [Satoshi + General Sans](https://fonts.google.com/share?selection.family=DM+Sans:wght@400;500;700)

**CSS Import:**

```css
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap");
```

### Spacing Variables

| Token         | Value             | Usage                     |
| ------------- | ----------------- | ------------------------- |
| `--space-xs`  | `4px` / `0.25rem` | Tight gaps                |
| `--space-sm`  | `8px` / `0.5rem`  | Icon gaps, inline spacing |
| `--space-md`  | `16px` / `1rem`   | Standard padding          |
| `--space-lg`  | `24px` / `1.5rem` | Section padding           |
| `--space-xl`  | `32px` / `2rem`   | Large gaps                |
| `--space-2xl` | `48px` / `3rem`   | Section margins           |
| `--space-3xl` | `64px` / `4rem`   | Hero padding              |

### Shadow Depths

| Level         | Value                          | Usage                       |
| ------------- | ------------------------------ | --------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`   | Subtle lift                 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)`    | Cards, buttons              |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)`  | Modals, dropdowns           |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #ff00ff;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #00ffff;
  border: 2px solid #00ffff;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #050510;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #00ffff;
  outline: none;
  box-shadow: 0 0 0 3px #00ffff20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Aurora Haze / Glassmorphism

**Keywords:** Ethereal glow, warm atmospheric tint, glass blur, smooth transitions, translucent panels, radial gradients, breathing glow

**Best For:** Interactive graph tools, creative platforms, developer tools, premium SaaS

**Key Effects:** Aurora radial blurs (dark mode), glass blur (`backdrop-filter: blur(24px) saturate(200%)`), breathing glow rings, motion tokens (`--ease-aurora`, `--dur-aurora`)

### Page Pattern

**Pattern Name:** Storytelling + Feature-Rich

- **CTA Placement:** Above fold
- **Section Order:** Hero > Features > CTA

---

## Anti-Patterns (Do NOT Use)

- ❌ Cheap visuals
- ❌ Fast animations

### Additional Forbidden Patterns

- ❌ **Emojis as icons**: Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer**: All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers**: Avoid scale transforms that shift layout
- ❌ **Low contrast text**: Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes**: Always use transitions (150-300ms)
- ❌ **Invisible focus states**: Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
