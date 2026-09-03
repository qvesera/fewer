"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { applySnapshot } from "@/lib/fewer/snapshot";
import { Loader2, History, RotateCcw, Trash2 } from "lucide-react";
import type { SavedGraph } from "@/lib/fewer/savedGraphs";
import type { SavedGraphData } from "@/lib/fewer/savedGraphs";

interface GraphVersionMeta {
  id: string;
  saved_graph_id: string;
  node_count: number;
  created_at: string;
}

function prettyDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistoryDialog({
  graph,
  onClose,
}: {
  graph: SavedGraph;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { loading: upgrading, startCheckout } = useBilling();
  const [versions, setVersions] = useState<GraphVersionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proLocked, setProLocked] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setProLocked(false);
    setVersions(null);
    try {
      const res = await fetch(`/api/graphs/${graph.id}/versions`);
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "plan_limit") {
          setProLocked(true);
          return;
        }
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      setVersions(Array.isArray(json.versions) ? json.versions : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load history";
      setError(msg);
    }
  }, [graph.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (v: GraphVersionMeta) => {
    setRestoringId(v.id);
    try {
      const res = await fetch(`/api/graphs/${graph.id}/versions/${v.id}`);
      const json = await res.json();
      if (!res.ok || !json.version) throw new Error(json.error || "Restore failed");
      const full = json.version as { data: SavedGraphData };
      applySnapshot(full.data);
      toast({
        title: "Version restored",
        description: "Loaded as unsaved changes — hit Save to keep it.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      toast({ title: "Could not restore", description: msg, variant: "destructive" });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (v: GraphVersionMeta) => {
    setDeletingId(v.id);
    try {
      const res = await fetch(`/api/graphs/${graph.id}/versions/${v.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setVersions((vs) => (vs ?? []).filter((x) => x.id !== v.id));
      toast({ title: "Version deleted" });
    } catch {
      toast({ title: "Could not delete version", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };
  const handleUpgrade = async () => {
    try {
      await startCheckout();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Checkout is unavailable";
      toast({ title: "Could not start checkout", description: msg, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent minimizeCloses={false} dialogTitle="History" dialogIcon={<History className="h-3.5 w-3.5 text-amber-500" />} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <History className="h-4 w-4" />
            </div>
            History — &quot;{graph.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Saved snapshots of this graph. Restore any version, or delete one.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {proLocked ? (
            <div className="px-1 py-2 space-y-1">
              <p className="text-[11px] text-foreground/90 font-medium">Version history is a Pro feature.</p>
              <p className="text-[11px] text-muted-foreground/70">
                Pro keeps an automatic snapshot every time you save a graph, so you can restore any past version.
                See <a href="/docs/plans" className="underline hover:text-foreground">plans</a> for details.
              </p>
              <Button
                size="sm"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="mt-1.5 gap-1 cursor-pointer"
              >
                {upgrading && <Loader2 className="h-3 w-3 animate-spin" />}
                Upgrade to Pro
              </Button>
            </div>
          ) : error ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground/70">{error}</p>
          ) : versions === null ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
              No versions yet. Each time you save this graph, an automatic snapshot is kept.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/10 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-foreground/90">{prettyDate(v.created_at)}</p>
                  <p className="text-[10px] text-muted-foreground/60">{v.node_count} nodes</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(v)}
                  disabled={restoringId === v.id || deletingId === v.id}
                  className="gap-1 cursor-pointer shrink-0"
                >
                  {restoringId === v.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(v)}
                  disabled={deletingId === v.id || restoringId === v.id}
                  className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                  title="Delete this version"
                >
                  {deletingId === v.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
