
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
  | { kind: "entry"; entry: FileSystemDirectoryEntry };

/** Safely read the internal drop payload string, if present. */
export function readFewerChildPayload(dataTransfer: DataTransfer): string {
  try {
    return dataTransfer.getData("application/fewer-child");
  } catch {
    return "";
  }
}
