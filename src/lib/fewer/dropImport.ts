
/**
 * Minimal safe drop source extraction. On portalized/sandboxed Chromium
 * (Flatpak, Snap, some Windows builds) ANY direct DataTransfer item
 * iteration — even `items.length` — can crash the renderer process.
 *
 * Therefore the ONLY safe thing to read from DataTransfer is the internal
 * `application/fewer-child` payload (for in-app node drops). For external
 * drops we skip DataTransfer entirely and fall back to the system picker,
 * which is the same reliable path the Import dialog uses.
 */
export type DroppedDirectorySource =
  | { kind: "handle"; handle: FileSystemDirectoryHandle }
  | { kind: "entry"; entry: FileSystemDirectoryEntry }
  /** Absolute OS path handed over by the shell's preload bridge (T-122). */
  | { kind: "path"; path: string };

/** Safely read the internal drop payload string, if present. */
export function readFewerChildPayload(dataTransfer: DataTransfer): string {
  try {
    return dataTransfer.getData("application/fewer-child");
  } catch {
    return "";
  }
}

/**
 * Absolute path of the first OS-dropped file, or `null`.
 *
 * Touches `dataTransfer.files` — never `items`, whose item-level access
 * (and even `items.length`) crashes the renderer on portalised/sandboxed
 * Chromium builds (Flatpak, Snap, some Windows). Callers only run this inside
 * the desktop shell, i.e. our own packaged Chromium, so the hazard does not
 * apply there; the web build keeps `dragDropImport` OFF and never calls it.
 *
 * `pathFor` is injected so tests exercise the shape without Electron's
 * `webUtils.getPathForFile`.
 */
export function droppedPathOf(
  files: FileList | File[] | null | undefined,
  pathFor: (file: File) => string,
): string | null {
  if (!files || files.length === 0) return null;
  const file = files[0];
  if (!file) return null;
  try {
    const path = pathFor(file);
    return path || null;
  } catch {
    return null;
  }
}
