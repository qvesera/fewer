import {
  FileCode,
  FileJson,
  FileImage,
  FileText,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  File as FileIcon,
  FileType,
} from "lucide-react";
import type { FileCategory } from "./types";

/** Presentation metadata (label, icon, color) for each file-type category. */
export interface CategoryMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  barColor: string;
}

export const CATEGORY_META: Record<FileCategory, CategoryMeta> = {
  code: { label: "Code", icon: FileCode, color: "text-emerald-400", barColor: "bg-emerald-500" },
  config: { label: "Config", icon: FileJson, color: "text-amber-400", barColor: "bg-amber-500" },
  image: { label: "Images", icon: FileImage, color: "text-pink-400", barColor: "bg-pink-500" },
  document: { label: "Docs", icon: FileText, color: "text-sky-400", barColor: "bg-sky-500" },
  archive: { label: "Archives", icon: FileArchive, color: "text-yellow-400", barColor: "bg-yellow-500" },
  data: { label: "Data", icon: FileSpreadsheet, color: "text-cyan-400", barColor: "bg-cyan-500" },
  media: { label: "Media", icon: FileVideo, color: "text-rose-400", barColor: "bg-rose-500" },
  binary: { label: "Binary", icon: FileIcon, color: "text-slate-400", barColor: "bg-slate-500" },
  text: { label: "Text", icon: FileType, color: "text-violet-400", barColor: "bg-violet-500" },
};

/** Category ids in a stable display order. */
export const FILE_CATEGORIES = Object.keys(CATEGORY_META) as FileCategory[];
