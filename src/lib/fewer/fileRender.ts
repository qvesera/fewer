/**
 * Pure browser-renderability logic — extracted from fileOps.ts so the
 * MIME/extension classification can be tested without the File System Access
 * API or DOM.
 */

/** Types browsers can render inline — opening a live handle for these in a new
 *  tab is fine. Everything else should go through the OS default app, or we'd
 *  silently trigger a download for the unsupported type. */
export const RENDERABLE_PREFIXES = ["image/", "text/", "video/", "audio/", "font/"];
export const RENDERABLE_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/svg+xml",
]);
export const RENDERABLE_EXT =
  /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico|pdf|txt|md|json|xml|html?|css|js|mjs|mp3|wav|ogg|oga|m4a|flac|mp4|webm|ogv|mov|ttf|otf|woff2?)$/i;

/** These look renderable (MIME starts with text/) but browsers simply download
 *  them on navigation. Send them to the OS default app instead. */
export const DOWNLOAD_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
]);

export function isBrowserRenderable(name: string, mime?: string): boolean {
  const type = (mime || "").trim().toLowerCase().split(";")[0];
  if (DOWNLOAD_TYPES.has(type) || /\.(?:csv|tsv|tab)$/i.test(name)) return false;
  if (RENDERABLE_PREFIXES.some((p) => type.startsWith(p))) return true;
  if (RENDERABLE_TYPES.has(type)) return true;
  return RENDERABLE_EXT.test(name);
}

export function stripMimeParams(mime: string | undefined): string {
  return (mime || "").trim().toLowerCase().split(";")[0];
}