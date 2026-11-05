/**
 * Accessibility preferences (T-215 / #514) — one persisted object, one class
 * flag per preference on `<html>`.
 *
 * The split is deliberate: `A11Y_CLASS_MAP` / `a11yHtmlClasses` are pure (they
 * decide, and are unit-tested without a DOM), while `applyA11yToDom` is the
 * only writer of those classes — called from the store setter, the settings
 * sync path and the pre-paint init script, so a value loaded from another tab,
 * the cloud or a reload lands before the first paint.
 *
 * What each class does lives in globals.css; `colorBlindSafe` and `tagInitials`
 * are not classes — they change how tags are painted (tags.ts / TagRing.tsx /
 * graphRenderer.ts), so they ride the state only.
 */

export interface A11ySettings {
  /** Harden the semantic colour tokens (borders, muted text, node sub-lines). */
  highContrast: boolean;
  /** Kill backdrop blur and translucent surfaces behind text. */
  solidSurfaces: boolean;
  /** Force the reduced-motion treatment regardless of the OS setting. */
  reduceMotion: boolean;
  /** Bigger hit targets (button floors, wider min-hit padding). */
  largeTargets: boolean;
  /** Heavier focus ring, on :focus as well as :focus-visible. */
  strongFocus: boolean;
  /** Paint tags through the dichromat-safe palette (tags.ts). */
  colorBlindSafe: boolean;
  /** Show each tag's initial instead of a colour-only dot/ring segment. */
  tagInitials: boolean;
}

export const A11Y_DEFAULTS: A11ySettings = {
  highContrast: false,
  solidSurfaces: false,
  reduceMotion: false,
  largeTargets: false,
  strongFocus: false,
  colorBlindSafe: false,
  tagInitials: false,
};

/** The preferences that are a class on <html>; the rest are paint-time flags.
 *  Kept as one record so the pre-paint script, the DOM writer and the tests all
 *  read the same names. */
export const A11Y_CLASS_MAP = {
  highContrast: "a11y-contrast",
  solidSurfaces: "a11y-solid",
  reduceMotion: "a11y-reduce-motion",
  largeTargets: "a11y-targets",
  strongFocus: "a11y-focus",
} as const;

export type A11yClassKey = keyof typeof A11Y_CLASS_MAP;

/** Every class name this module ever writes — handy for assertions. */
export function a11yClassList(a: A11ySettings): string[] {
  return (Object.keys(A11Y_CLASS_MAP) as A11yClassKey[])
    .filter((key) => a[key])
    .map((key) => A11Y_CLASS_MAP[key]);
}

/** Sanitise a persisted/cloud-delivered blob: unknown or wrong-typed keys fall
 *  back to the default (off), so a hand-edited setting can't put `<html>` into
 *  a class we don't render. */
export function normalizeA11y(value: unknown): A11ySettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  const flag = (key: keyof A11ySettings) => raw[key] === true;
  return {
    highContrast: flag("highContrast"),
    solidSurfaces: flag("solidSurfaces"),
    reduceMotion: flag("reduceMotion"),
    largeTargets: flag("largeTargets"),
    strongFocus: flag("strongFocus"),
    colorBlindSafe: flag("colorBlindSafe"),
    tagInitials: flag("tagInitials"),
  };
}

/** The single writer of the a11y classes. Removes every managed class first,
 *  so switching a flag off can never leave a stale one behind. Idempotent. */
export function applyA11yToDom(a: A11ySettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const all = Object.values(A11Y_CLASS_MAP);
  for (const cls of all) root.classList.remove(cls);
  for (const cls of a11yClassList(a)) root.classList.add(cls);
}
