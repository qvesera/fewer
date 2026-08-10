"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Github, Loader2, Globe, AlertCircle, BellRing, Lock } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useImport } from "@/hooks/use-github-import";
import { useAuth } from "@/hooks/use-auth";
import { useWatch } from "@/hooks/use-watch";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

function isGitHubUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "github.com";
  } catch {
    return false;
  }
}

interface ImportUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportUrlDialog({ open, onOpenChange }: ImportUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<ImportOptions>({ ...DEFAULT_IMPORT_OPTIONS });
  const { loading, error, setError, importUrl, truncated } = useImport();
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const { user } = useAuth();
  const { add, isWatching } = useWatch();
  const { toast } = useToast();

  const reset = () => {
    setUrl("");
    setError(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const handleImport = async () => {
    if (!url.trim() || loading) return;
    const ok = await importUrl(url, options);
    if (ok) {
      const nodeCount = useGraphStore.getState().nodes.length;
      toast({
        title: "Imported",
        description: `${nodeCount} node${nodeCount === 1 ? "" : "s"} loaded.${truncated ? " Showing first items (crawl limit reached)." : ""}`,
      });
      await new Promise((r) => setTimeout(r, 20));
      const autoHidden = useGraphStore.getState().autoHideCount;
      if (autoHidden > 0) {
        const threshold = useGraphStore.getState().autoHideThreshold;
        toast({
          title: "Large folders collapsed",
          description: `${autoHidden} item${autoHidden === 1 ? " was" : "s were"} auto-hidden (folders with more than ${threshold} children). Use Hidden Nodes in the sidebar to reveal them.`,
        });
      }
      handleClose();
    }
  };

  const handleWatchToggle = async (checked: boolean) => {
    if (!user) {
      onOpenChange(false);
      setTimeout(() => useGraphStore.getState().setAuthOpen(true), 150);
      return;
    }
    const trimmed = url.trim();
    if (!trimmed || isGitHubUrl(trimmed)) return;
    if (checked) {
      const ok = await add(trimmed);
      if (ok) {
        toast({ title: "Watching for changes", description: "You'll get a daily digest when this index changes." });
      } else {
        toast({ title: "Could not watch", variant: "destructive" });
      }
    } else {
      // Unwatch handled in the Watched tab; the toggle reflects current state.
      toast({ title: "Manage watches in Settings, Watched tab" });
    }
  };

  const canWatch = !!user && !!url.trim() && !isGitHubUrl(url.trim());
  const watching = isWatching(url);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border border-border/40 shadow-xl">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Globe className="h-5 w-5 text-muted-foreground/80" />
            Import from URL
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            Paste a GitHub repository URL or a public file index URL to visualize its directory structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              URL
            </Label>
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !loading) {
                  handleImport();
                }
              }}
              placeholder="https://github.com/owner/repo or https://example.com/data/"
              className="text-xs font-mono bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              Supports: <code className="text-[10px] font-mono bg-muted/50 px-1 rounded">https://github.com/owner/repo</code> or{" "}
              <code className="text-[10px] font-mono bg-muted/50 px-1 rounded">https://github.com/owner/repo/tree/branch/path</code> or any public file index URL
            </p>
          </div>

          {/* Watch for changes */}
          {!isGitHubUrl(url.trim()) && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/10 p-3">
              <div className="flex items-center gap-2.5">
                <BellRing className="h-4 w-4 text-primary/80" />
                <div>
                  <p className="text-xs font-medium text-foreground">Watch for changes</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {user
                      ? "Daily digest (23:59) when this index changes."
                      : "Sign in to get daily change digests."}
                  </p>
                </div>
              </div>
              {user ? (
                <Switch checked={watching} onCheckedChange={handleWatchToggle} disabled={!canWatch} />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px] cursor-pointer"
                  onClick={handleWatchToggle}
                >
                  <Lock className="h-3 w-3" />
                  Sign in
                </Button>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-400 dark:text-red-300 leading-normal font-medium flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="overflow-y-auto pr-1 gm-scroll">
          <ImportOptionsPanel
            options={options}
            onChange={(partial) => setOptions((prev) => ({ ...prev, ...partial }))}
            advancedModeEnabled={advancedModeEnabled}
          />
        </div>

        <DialogFooter className="pt-4 border-t border-border/20 flex flex-row items-center justify-end gap-3 w-full">
          <Button
            variant="outline"
            size="default"
            onClick={handleClose}
            disabled={loading}
            className="text-xs border-border/80 text-foreground font-medium hover:bg-muted/50 h-10 px-4 flex-1 sm:flex-initial"
          >
            Cancel
          </Button>
          <Button
            size="default"
            onClick={handleImport}
            disabled={!url.trim() || loading}
            className="text-xs font-medium bg-gradient-to-r from-primary to-primary text-white hover:opacity-90 shadow-sm shadow-orange-500/10 active:scale-[0.99] transition-all gap-1.5 h-10 px-4 flex-1 sm:flex-initial"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Github className="h-4 w-4" />
            )}
            {loading ? "Importing..." : "Import Graph"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}