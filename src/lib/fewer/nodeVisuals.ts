import type { ComponentType } from "react";
import { FileCode, FileJson, FileImage, FileText, FileArchive, FileSpreadsheet, FileVideo, File as FileIcon, FileType } from "lucide-react";
import type { FileCategory } from "./types";

/**
 * The icon-per-category map and the byte formatter, split out of nodeDisplay
 * (T-150 follow-up). nodeDisplay imports @xyflow/react for handle positions,
 * and the marketing home page renders the same icons and sizes in its preview
 * cards; keeping them here means the landing page does not pull the graph
 * library into its bundle. nodeDisplay re-exports both, so every existing
 * import keeps working.
 */

export const CATEGORY_ICON: Record<FileCategory, ComponentType<{ className?: string }>> = {
  code: FileCode,
  config: FileJson,
  image: FileImage,
  document: FileText,
  archive: FileArchive,
  data: FileSpreadsheet,
  media: FileVideo,
  binary: FileIcon,
  text: FileType,
};

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
