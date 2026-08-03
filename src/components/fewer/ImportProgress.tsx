"use client";

import { Progress } from "@/components/ui/progress";

interface ImportProgressProps {
  progress: {
    phase: "reading" | "building-tree" | "layout" | "rendering";
    processed: number;
    total: number;
  } | null;
}

export function ImportProgress({ progress }: ImportProgressProps) {
  if (!progress || progress.total === 0) return null;

  const percent = Math.round((progress.processed / progress.total) * 100);
  const phaseLabels: Record<string, string> = {
    reading: "Reading files from disk...",
    "building-tree": "Building graph structure...",
    layout: "Computing layout...",
    rendering: "Rendering...",
  };

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-4">
      <p className="text-sm text-muted-foreground">
        {phaseLabels[progress.phase] ?? "Processing..."}
      </p>
      <Progress value={percent} className="w-64 h-2" />
      <p className="text-xs text-muted-foreground">
        {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} items
      </p>
    </div>
  );
}