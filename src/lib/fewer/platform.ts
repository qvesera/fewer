/**
 * Platform detection for modifier-key labels.
 * Mac/iOS report ⌘ (Command) and ⌥ (Option); everyone else uses Ctrl and Alt.
 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(
    navigator.platform || navigator.userAgent || "",
  );
}
