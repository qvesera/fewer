// Preview classification (T-091 / #303): what can be shown in-app vs what
// falls back to the OS opener. Pure — the panel consumes it.
export type PreviewKind = "image" | "pdf" | "text" | "none";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
const TEXT_EXT = new Set([
  "txt", "md", "json", "ts", "tsx", "js", "jsx", "css", "scss", "html", "htm",
  "xml", "yaml", "yml", "toml", "ini", "cfg", "csv", "tsv", "log", "sh", "bash",
  "py", "rs", "go", "java", "c", "h", "cpp", "hpp", "sql", "env", "gitignore",
]);

/** Size caps for in-app preview; larger files fall back to the OS opener. */
export const PREVIEW_CAPS = {
  image: 50 * 1024 * 1024,
  pdf: 100 * 1024 * 1024,
  text: 2 * 1024 * 1024,
} as const;

export function previewKindFor(fileName: string): PreviewKind {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (fileName === ".gitignore" || fileName === "Dockerfile" || fileName === "Makefile") return "text";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext)) return "text";
  return "none";
}

export function previewCapFor(kind: PreviewKind): number {
  if (kind === "image") return PREVIEW_CAPS.image;
  if (kind === "pdf") return PREVIEW_CAPS.pdf;
  if (kind === "text") return PREVIEW_CAPS.text;
  return 0;
}

/** Blob MIME for images; pdf/text handled by the panel. */
export function imageMimeFor(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "avif") return "image/avif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "ico") return "image/x-icon";
  if (ext === "gif") return "image/gif";
  if (ext === "png") return "image/png";
  return "image/jpeg"; // jpg/jpeg/default raster
}
