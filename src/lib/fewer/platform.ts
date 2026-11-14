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

/** Windows platforms report `Win32` on `navigator.platform` or `Windows` in the user agent. */
export function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Win|Windows/.test(navigator.platform || navigator.userAgent || "");
}
