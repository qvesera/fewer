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
import { Github, Loader2, Globe, AlertCircle } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useGitHubImport } from "@/hooks/use-github-import";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

interface ImportUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportUrlDialog({ open, onOpenChange }: ImportUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<ImportOptions>({ ...DEFAULT_IMPORT_OPTIONS });
  const { loading, error, setError, importUrl } = useGitHubImport();
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
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
        title: "Repository imported",
        description: `${nodeCount} node${nodeCount === 1 ? "" : "s"} loaded.`,
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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border border-border/40 shadow-xl">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Globe className="h-5 w-5 text-muted-foreground/80" />
            Import from URL
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            Paste a GitHub repository URL to visualize its directory structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
              <Github className="h-3.5 w-3.5" />
              GitHub Repository URL
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
              placeholder="https://github.com/owner/repo"
              className="text-xs font-mono bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              Supports: <code className="text-[10px] font-mono bg-muted/50 px-1 rounded">https://github.com/owner/repo</code> or{" "}
              <code className="text-[10px] font-mono bg-muted/50 px-1 rounded">https://github.com/owner/repo/tree/branch/path</code>
            </p>
          </div>

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