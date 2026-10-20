"use client";

import { Loader2, PauseCircle, X } from "lucide-react";
import { useScanStatus } from "@/lib/fewer/scanStatus";
import { cancelActiveScan } from "@/lib/fewer/progressiveOpen";
import { plural } from "@/lib/fewer/plural";
import { cn } from "@/lib/utils";

/**
 * Scan status chip (T-207): sits in the shell header while a big folder is
 * being filled in — "Scanning … N cards · M folders", or "paused" once the
 * budget stops the crawl (deeper folders carry a "not scanned" badge to
 * finish on demand). Renders nothing when idle, so the web navbar can host it
 * unchanged.
 */
export function ScanStatusChip() {
  const status = useScanStatus();
  if (!status.active && !status.stopped) return null;

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
        {status.scanned.toLocaleString()} {plural(status.scanned, "card")}
        {status.dirs ? ` · ${status.dirs.toLocaleString()} ${plural(status.dirs, "folder")}` : ""}
      </span>
      {!status.active && (
        <span className="hidden sm:inline text-[9px] opacity-80">— click a folder to load it</span>
      )}
      {status.active && (
        <button
          type="button"
          onClick={cancelActiveScan}
          aria-label="Stop scanning"
          title="Stop scanning — deeper folders stay marked as not scanned"
          className="rounded-full p-0.5 hover:bg-primary/20"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}