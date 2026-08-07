"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useWatch } from "@/hooks/use-watch";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Globe, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useGraphStore } from "@/store/graphStore";

export function WatchedIndexesPanel() {
  const { user } = useAuth();
  const { watched, loading, remove } = useWatch();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="flex flex-col gap-4 py-1">
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          Sign in to watch public file indexes and get a daily digest when they change.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 w-fit text-xs cursor-pointer"
          onClick={() => {
            useGraphStore.getState().setSettingsOpen(false);
            setTimeout(() => useGraphStore.getState().setAuthOpen(true), 150);
          }}
        >
          <Lock className="h-3.5 w-3.5" />
          Sign in to watch indexes
        </Button>
      </div>
    );
  }

  const handleRemove = async (url: string) => {
    setRemoving(url);
    const ok = await remove(url);
    if (ok) {
      toast({ title: "Stopped watching", description: url });
    } else {
      toast({ title: "Could not stop watching", variant: "destructive" });
    }
    setRemoving(null);
  };

  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Watched indexes
          </p>
        </div>
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          These public file indexes are crawled every night at 23:59. If anything changed,
          you'll get one consolidated email the next morning. No changes — no email.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : watched.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
          No watched indexes. Import a public file index URL and toggle "Watch for changes" to add one.
        </p>
      ) : (
        <div className="space-y-1.5 w-full min-w-0">
          {watched.map((w) => (
            <div
              key={w.id}
              className="group flex items-center gap-1.5 rounded-lg border border-border/30 bg-muted/10 p-1.5 w-full min-w-0"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-primary/80" />
              <span className="truncate text-[11px] text-foreground/90 flex-1 min-w-0 font-mono" title={w.url}>
                {w.url}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(w.url)}
                disabled={removing === w.url}
                className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
                title="Stop watching"
              >
                {removing === w.url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}