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

/**
 * Map a dataSource prefix to a display label for "Open in provider".
 * Lives here (not nodeDisplay) because menuInfo and the marketing preview both
 * need it without pulling @xyflow/react in; nodeDisplay re-exports it.
 */
export function providerLabelFromSource(dataSource: string | null): string {
  if (!dataSource) return "Provider";
  if (dataSource.startsWith("cloud:github")) return "GitHub";
  if (dataSource.startsWith("cloud:google-drive")) return "Google Drive";
  if (dataSource.startsWith("cloud:onedrive")) return "OneDrive";
  if (dataSource.startsWith("cloud:sharepoint")) return "SharePoint";
  if (dataSource.startsWith("cloud:azure-devops")) return "Azure DevOps";
  if (dataSource.startsWith("cloud:azure-blob")) return "Azure Blob";
  // URL imports (GitHub repo or a public file index) carry real source URLs.
  if (dataSource.startsWith("url:")) {
    try {
      const u = new URL(dataSource.slice(4));
      if (u.hostname === "github.com") return "GitHub";
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "Site";
    }
  }
  return "Provider";
}
