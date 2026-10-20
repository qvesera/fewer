"use client";

import { Loader2, PauseCircle, Play, X } from "lucide-react";
import { useScanStatus } from "@/lib/fewer/scanStatus";
import { cancelActiveScan, resumeBackgroundScan } from "@/lib/fewer/progressiveOpen";
import { cn } from "@/lib/utils";

/** `${n} cards` — the count belongs to the noun; never print it twice (T-215). */
function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${n === 1 ? noun : `${noun}s`}`;
}

/**
 * Scan status chip (T-207/T-215): sits in the header while a big folder is
 * being filled in — "Scanning …" with live counts, or a paused chip with a
 * Resume button once the budget stops the crawl. Renders nothing when idle or
 * when the user stopped the scan, so the web navbar can host it unchanged.
 */
export function ScanStatusChip() {
  const status = useScanStatus();
  if (!status.active && !status.stopped) return null;
  const paused = !status.active && status.stopped;

  return (
    <div
      data-scan-chip
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium",
        status.active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
      )}
      role="status"
    >
      {status.active ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <PauseCircle className="h-3 w-3" />
      )}
      <span className="max-w-[14rem] truncate">
        {status.active ? "Scanning" : "Scan paused"}
        {status.root ? ` ${status.root}` : ""}
      </span>
      <span className="tabular-nums">
        {count(status.scanned, "card")}
        {status.dirs ? ` · ${count(status.dirs, "folder")}` : ""}
      </span>
      {paused && status.pending && (
        <>
          <span className="hidden sm:inline text-[9px] opacity-80">— click a folder to load it, or</span>
          <button
            type="button"
            onClick={resumeBackgroundScan}
            title="Continue scanning the rest of this folder"
            className="flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-amber-500/20"
          >
            <Play className="h-3 w-3" />
            Resume
          </button>
        </>
      )}
      {status.active && (
        <button
          type="button"
          onClick={cancelActiveScan}
          aria-label="Stop scanning"
          title="Stop scanning — the folder stays as loaded so far"
          className="rounded-full p-0.5 hover:bg-primary/20"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}