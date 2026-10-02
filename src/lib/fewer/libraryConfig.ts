// Desktop library-folder configuration (T-089 / #301). The chosen library
// root lives in localStorage — it is device-local settings, not graph data,
// and survives restarts without any server.
const KEY = "fewer.libraryDir";

/** SSR-safe read; empty string when unset (web, or desktop before setup). */
export function getLibraryDir(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLibraryDir(dir: string): void {
  if (typeof window === "undefined") return;
  try {
    if (dir) window.localStorage.setItem(KEY, dir);
    else window.localStorage.removeItem(KEY);
  } catch {
    // localStorage unavailable (private mode) — library just won't persist the choice.
  }
}
