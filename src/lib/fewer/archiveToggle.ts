/**
 * Naming rules for turning a folder card into an archive card and back.
 *
 * Pure on purpose: the graph action and the Export Changes plan both need the
 * same answer, and neither should depend on the archive readers (those pull
 * the wasm engine in).
 */
const ARCHIVE_EXTENSIONS = [
  "tar.gz",
  "tar.xz",
  "tar.bz2",
  "tar.zst",
  "zip",
  "tar",
  "tgz",
  "7z",
  "rar",
  "xz",
  "bz2",
  "zst",
  "gz",
];

/** The archive extension of a name, lowercased, longest match first. */
export function archiveExtensionOf(name: string): string | null {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.find((ext) => lower.endsWith(`.${ext}`)) ?? null;
}

/** `Photos` → `Photos.zip`; a name that already ends in an archive ext is kept. */
export function compressedName(name: string): string {
  return archiveExtensionOf(name) ? name : `${name}.zip`;
}

/** `Photos.zip` → `Photos`; null when the name carries no known extension. */
export function extractedName(name: string): string | null {
  const ext = archiveExtensionOf(name);
  if (!ext) return null;
  const stripped = name.slice(0, -(ext.length + 1));
  return stripped || null;
}
