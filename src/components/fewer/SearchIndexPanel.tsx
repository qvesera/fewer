"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { isHost, nativeIndexClear, nativeIndexStatus, type NativeIndexStats } from "@/lib/fewer/nativeShell";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Settings → Help → Search index (T-200): shows how much of the device the
 * index occupies and lets the user clear it. Shell only — the web build has
 * no index, so the card renders nothing there.
 */
export function SearchIndexPanel() {
  const { toast } = useToast();
  const [stats, setStats] = useState<NativeIndexStats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isHost()) return;
    try {
      setStats(await nativeIndexStatus());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isHost() || !stats) return null;

  const clear = async () => {
    setBusy(true);
    try {
      const { removed } = await nativeIndexClear();
      await load();
      toast({ title: "Search index cleared", description: `${removed.toLocaleString()} entries removed.` });
    } catch (err) {
      toast({
        title: "Could not clear the index",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/40 bg-card/20 p-3.5">
      <div className="text-xs font-semibold">Search index</div>
      <div className="text-[11px] text-muted-foreground">
        {stats.total.toLocaleString()} entries · {formatBytes(stats.bytes)} · {stats.roots.length}{" "}
        {stats.roots.length === 1 ? "folder" : "folders"} indexed. Only folders you open are indexed, and never file
        contents.
      </div>
      <Button variant="outline" size="sm" className="h-8 w-fit text-xs" disabled={busy} onClick={() => void clear()}>
        Clear search index
      </Button>
    </div>
  );
}