"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { computeStats, formatBytes } from "@/lib/fewer/stats";
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
  Folder,
  HardDrive,
} from "lucide-react";
import type { FileCategory } from "@/lib/fewer/types";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<
  FileCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  code: { label: "Code", icon: FileCode, color: "text-emerald-400" },
  config: { label: "Config", icon: FileJson, color: "text-amber-400" },
  image: { label: "Images", icon: FileImage, color: "text-pink-400" },
  document: { label: "Docs", icon: FileText, color: "text-sky-400" },
  archive: { label: "Archives", icon: FileArchive, color: "text-yellow-400" },
  data: { label: "Data", icon: FileSpreadsheet, color: "text-cyan-400" },
  media: { label: "Media", icon: FileVideo, color: "text-rose-400" },
  binary: { label: "Binary", icon: FileIcon, color: "text-slate-400" },
  text: { label: "Text", icon: FileType, color: "text-violet-400" },
};

export function StatsPanel() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const hiddenCount = useGraphStore((s) => s.hiddenIds.length);
  const selectedCount = useGraphStore((s) => s.selectedNodeIds.length);
  const stats = useMemo(() => computeStats(nodes, edges), [nodes, edges]);

  if (nodes.length === 0) return null;

  const sortedCategories = (
    Object.entries(stats.byCategory) as [FileCategory, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = stats.totalFiles || 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-orange-300">
            <Folder className="h-3 w-3" /> Folders
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums">
            {stats.totalFolders}
          </div>
        </div>
        <div className="rounded-xl border border-purple-400/30 bg-purple-500/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-purple-300">
            <FileIcon className="h-3 w-3" /> Files
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums">
            {stats.totalFiles}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card/40 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <HardDrive className="h-3 w-3" /> Total size
        </div>
        <div className="mt-0.5 text-lg font-bold tabular-nums">
          {formatBytes(stats.totalSize)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {stats.totalSize.toLocaleString()} bytes raw
        </div>
      </div>

      {sortedCategories.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            By category
          </div>
          <div className="space-y-2">
            {sortedCategories.map(([cat, count]) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const pct = (count / total) * 100;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                      <span className="font-medium">{meta.label}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-purple-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/40 bg-card/40 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Edges</span>
          <span className="tabular-nums font-medium">{edges.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Selected</span>
          <span className="tabular-nums font-medium">{selectedCount}</span>
        </div>
        {hiddenCount > 0 && (
          <div className="flex items-center justify-between text-amber-300">
            <span>Hidden</span>
            <span className="tabular-nums font-medium">{hiddenCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
