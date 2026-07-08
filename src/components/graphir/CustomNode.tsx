"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileImage,
  FileText,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  File as FileIcon,
  FileType,
} from "lucide-react";
import type { GraphirNode, FileCategory } from "@/lib/graphir/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ className?: string }>> = {
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

function getHandlePositions(isHorizontal?: boolean) {
  // For horizontal layouts, source = right, target = left.
  // For vertical layouts, source = bottom, target = top.
  if (isHorizontal) {
    return { source: Position.Right, target: Position.Left };
  }
  return { source: Position.Bottom, target: Position.Top };
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CustomNodeImpl({ data, selected }: NodeProps<GraphirNode>) {
  const isHorizontal = (data.isHorizontal as boolean) ?? false;
  const { source, target } = getHandlePositions(isHorizontal);
  const isFolder = data.type === "folder";
  const Icon = isFolder
    ? data.isRoot
      ? FolderOpen
      : Folder
    : CATEGORY_ICON[data.category ?? "text"] ?? FileIcon;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-xl transition-all duration-200",
        "min-w-[180px] max-w-[220px]",
        isFolder
          ? "border-orange-400/40 bg-orange-500/15 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.4)]"
          : "border-purple-400/40 bg-purple-500/15 shadow-[0_8px_24px_-8px_rgba(168,85,247,0.4)]",
        data.highlighted && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background",
        data.dimmed && "opacity-30 saturate-50",
        selected && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background",
        "hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]"
      )}
    >
      {selected && (
        <NodeResizer
          minWidth={180}
          minHeight={50}
          isVisible={!!selected}
          lineClassName="!border-cyan-400/70"
          handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
        />
      )}

      <Handle
        type="target"
        position={target}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
      />

      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          isFolder
            ? "bg-orange-500/30 text-orange-200"
            : "bg-purple-500/30 text-purple-200"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-sm font-semibold text-foreground",
            data.highlighted && "text-amber-300"
          )}
          title={data.label}
        >
          {data.label}
        </span>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{isFolder ? "folder" : data.extension ? `.${data.extension}` : "file"}</span>
          {!isFolder && data.size ? (
            <>
              <span className="opacity-50">·</span>
              <span>{formatSize(data.size)}</span>
            </>
          ) : null}
        </div>
      </div>

      <Handle
        type="source"
        position={source}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
      />
    </div>
  );
}

export const CustomNode = memo(CustomNodeImpl);
