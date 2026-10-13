# Illustration brief — "The pile and the map"

> Art direction only. The illustration is hand-drawn (no AI generation, no
> stock) and ships as `public/reorg-graph.svg`. Until that file exists,
> `TransformationBand.tsx` renders nothing — the band appears by itself the
> moment the asset lands.

**Placement:** one full-width band on the marketing home page, after the
`tree`-vs-graph comparison and before "How it works". It is not another
comparison: the toggle proves the mechanic, this sells the feeling.
Implemented by `src/components/marketing/TransformationBand.tsx`.

**Master:** 1600×700 (16:7), transparent background. Design so the left 60%
carries all meaning — on mobile it just scales inside a fixed aspect box, no
crop.

## Composition

Three zones, left to right:

1. **The pile (left ~⅓).** An open folder tipped on its side on the floor.
   8–12 loose file cards at random angles (±15–35°), a few overlapping, one
   face-down. 2–3 tangled bezier connectors loop between them, crossing,
   going nowhere — the "you cannot see the shape of it" feeling.
2. **The transformation (middle, narrow).** 3 cards caught mid-flight on a
   shallow arc, one with its connector half-drawn behind it. The only motion
   in a static frame, and what says *this thing animates*.
3. **The map (right ~⅔).** The same cards, tidied into a 2-level tree on the
   grid, joined by clean S-bezier edges. Optionally wrap 3 of them in a group
   frame (rounded rect + title pill) with one card collapsing toward a pill —
   ties straight to the headline feature.

**The floor is the whole point:** draw the product's own dot grid in
perspective under everything, fading at the edges. Same surface as the app.

## Geometry

| Rule | Value | Source |
| --- | --- | --- |
| Projection | true isometric, 30°, 120° between axes | — |
| Folder card | 240×200 (6:5) | `src/lib/fewer/layout.ts` |
| File card | 220×58 (3.8:1) | `src/lib/fewer/layout.ts` |
| Corner radius | 5% of short side (~12px at 240 wide) | `rounded-xl` on the real card |
| Stroke | 1.5px-equivalent (1.6–2px at 1600 wide), round cap and join | lucide 24/1.5 |
| Edge curve | S-bezier, controls at ~40% of the gap, card-right to card-left, no elbows | React Flow `getBezierPath` |
| Spacing unit | 24px — the canvas dot gap. Tidy gaps = 2 units; edges clear cards by ≥1 unit | `GraphCanvas.tsx` |
| Depth | max 2 z-levels. Cards on a grid, not a building — no extrusion, no towers | — |

## Palette

Values are the existing CSS variables, light and dark.

| Role | Light | Dark |
| --- | --- | --- |
| Floor dots | `rgba(100,116,139,.20)` | `rgba(173,181,189,.18)` |
| Folder fill / stroke / icon | `rgba(249,115,22,.08)` / `rgba(249,115,22,.35)` / `#f97316` | `rgba(253,126,20,.12)` / `rgba(253,126,20,.45)` / `#ffa94d` |
| File fill / stroke / icon | `rgba(168,85,247,.08)` / `rgba(168,85,247,.35)` / `#9333ea` | `rgba(190,75,219,.18)` / `rgba(190,75,219,.45)` / `#e599f7` |
| Group frame / stroke | `rgba(148,163,184,.08)` / `rgba(148,163,184,.35)` | `rgba(134,142,150,.12)` / `rgba(134,142,150,.45)` |
| Edges | `rgba(100,116,139,.40)` | `rgba(173,181,189,.50)` |
| Cyan accent, one element only | `#22d3ee` | same |
| Brand gradient, one element max | `#ff00ff → #22d3ee → #a855f7` | same |

Fills are translucent tints, never opaque cards. Background fully transparent.

## Do

- Flat fill + stroke. Exactly **one** soft blurred shadow, under the loose pile,
  to seat it on the floor. Nothing else casts.
- 3–6 short Geist Mono labels at ~85% opacity (`src`, `components`,
  `README.md`, `graph.ts`), always screen-parallel, never isometric.
- One brand-gradient element and one cyan accent. That is the whole colour
  budget above the tokens.

## Do not

- No gradients or glows on cards. No sparkles, stars, robots, brains, rockets,
  magnifying glasses, mascots or cartoon faces.
- No emoji anywhere. No mix of outlined and filled on the same element.
- No drop shadow on every element. No chunky cartoon radii; stroke stays at
  1.5px-equivalent.
- No gradient text (the page is removing it).

## Light and dark

Preferred: one **SVG wired to CSS variables** (`var(--fewer-folder-bg)`,
`var(--fewer-file-border)`, `var(--fewer-edge)`, …) so one file serves both
themes and cannot drift from the product palette. No `<style>` block, no
embedded fonts (`font-family="var(--font-geist-mono), ui-monospace, monospace"`
as an attribute), at most one `<filter>` (the single blur above).

If raster is easier: `reorg-light.png` + `reorg-dark.png` at 2x, swapped with
`<picture>`; update `TransformationBand.tsx` accordingly.

## Deliverable

`public/reorg-graph.svg`: viewBox `0 0 1600 700`, `role="img"` with a
`<title>`, svgo-clean, under 25 KB. Optional 1200×1600 portrait variant if the
16:7 loses meaning below 768px. Nothing baked in that the page already says in
text.

## Optional animation hooks

- The mid-flight connector gets a `stroke-dasharray`, so a future slice can
  draw it on reveal.
- Tidy-zone cards carry `data-mk-node` so the existing `Reveal` stagger
  (globals.css `[data-reveal]`) can fade them in left to right.
- The pile gets no entrance motion; it is the "before", it should feel already
  messy.

## Caption (already in the component)

> The same folder. One is a pile, the other is a map.
