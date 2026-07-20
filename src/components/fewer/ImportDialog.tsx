"use client";

import { useState, useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  FolderOpen,
  Loader2,
  Filter,
  Eye,
  EyeOff,
  Package,
  FolderX,
  FileIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: ImportOptions) => void;
  importing?: boolean;
}

export function ImportDialog({
  open,
  onOpenChange,
  onConfirm,
  importing = false,
}: ImportDialogProps) {
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    ...DEFAULT_IMPORT_OPTIONS,
  });

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setOptions({ ...DEFAULT_IMPORT_OPTIONS });
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const update = (partial: Partial<ImportOptions>) => {
    setOptions((prev) => ({ ...prev, ...partial }));
  };

  useEffect(() => {
    if (!advancedModeEnabled) {
      setOptions((prev) => ({
        ...prev,
        includeHidden: DEFAULT_IMPORT_OPTIONS.includeHidden,
        includeVendored: DEFAULT_IMPORT_OPTIONS.includeVendored,
        skipEmptyFolders: DEFAULT_IMPORT_OPTIONS.skipEmptyFolders,
        includeFiles: DEFAULT_IMPORT_OPTIONS.includeFiles,
        extensions: DEFAULT_IMPORT_OPTIONS.extensions,
        caseSensitiveExtensions: DEFAULT_IMPORT_OPTIONS.caseSensitiveExtensions,
      }));
    }
  }, [advancedModeEnabled]);

  const basicOptions = (
    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/25 p-4 transition-all">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Max Scan Depth</Label>
        <span className="text-xs font-mono font-semibold text-foreground/80">
          {options.maxDepth === 0 ? "Unlimited" : `${options.maxDepth} levels`}
        </span>
      </div>
      <Slider
        value={[options.maxDepth]}
        onValueChange={([v]) => update({ maxDepth: v })}
        min={0}
        max={10}
        step={1}
      />
      <p className="text-xs text-muted-foreground leading-normal">
        How deep to scan. 0 = no limit.
      </p>
    </div>
  );

  const advancedOptions = (
    <div className="space-y-3">
      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85 block mt-2">Advanced Options</Label>
      
      <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
        <div className="flex items-center gap-3">
          {options.includeHidden ? (
            <Eye className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          )}
          <div className="space-y-0.5">
            <Label htmlFor="include-hidden" className="text-xs font-semibold cursor-pointer">
              Include Hidden Files
            </Label>
            <p className="text-xs text-muted-foreground">
              Scan hidden files (<code className="font-mono text-[10px] bg-muted px-1 rounded">.gitignore</code>, <code className="font-mono text-[10px] bg-muted px-1 rounded">.env</code>, etc.)
            </p>
          </div>
        </div>
        <Switch
          id="include-hidden"
          checked={options.includeHidden}
          onCheckedChange={(v) => update({ includeHidden: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
        <div className="flex items-center gap-3">
          <Package className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          <div className="space-y-0.5">
            <Label htmlFor="include-vendored" className="text-xs font-semibold cursor-pointer">
              Include node_modules
            </Label>
            <p className="text-xs text-muted-foreground">
              Scan <code className="font-mono text-[10px] bg-muted px-1 rounded">node_modules</code> and dependency folders.
            </p>
          </div>
        </div>
        <Switch
          id="include-vendored"
          checked={options.includeVendored}
          onCheckedChange={(v) => update({ includeVendored: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
        <div className="flex items-center gap-3">
          <FolderX className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          <div className="space-y-0.5">
            <Label htmlFor="skip-empty-folders" className="text-xs font-semibold cursor-pointer">
              Skip Empty Folders
            </Label>
            <p className="text-xs text-muted-foreground">
              Hide folders with no files inside.
            </p>
          </div>
        </div>
        <Switch
          id="skip-empty-folders"
          checked={options.skipEmptyFolders}
          onCheckedChange={(v) => update({ skipEmptyFolders: v })}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
        <div className="flex items-center gap-3">
          <FileIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          <div className="space-y-0.5">
            <Label htmlFor="include-files" className="text-xs font-semibold cursor-pointer">
              Show Files on Canvas
            </Label>
            <p className="text-xs text-muted-foreground">
              Show file nodes. Off = directories only.
            </p>
          </div>
        </div>
        <Switch
          id="include-files"
          checked={options.includeFiles}
          onCheckedChange={(v) => update({ includeFiles: v })}
        />
      </div>

      <div className="space-y-2.5 rounded-xl border border-border/40 p-4 bg-card/10">
        <Label className="text-xs font-semibold text-muted-foreground">File Extensions</Label>
        <p className="text-xs text-muted-foreground">
          Only scan these extensions. Comma-separated.
        </p>
        <Input
          value={options.extensions.join(", ")}
          onChange={(e) => {
            const exts = e.target.value
              .split(",")
              .map((s) => s.trim().replace(/^\./, ""))
              .filter(Boolean);
            update({ extensions: exts });
          }}
          placeholder="e.g. ts, tsx, js, json"
          className="font-mono text-xs h-9 bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2.5 pt-1">
          <Switch
            checked={options.caseSensitiveExtensions}
            onCheckedChange={(v) => update({ caseSensitiveExtensions: v })}
            id="case-sensitive"
          />
          <Label
            htmlFor="case-sensitive"
            className="text-xs text-muted-foreground cursor-pointer font-medium"
          >
            Case-Sensitive Match
          </Label>
        </div>
      </div>
    </div>
  );

  const summary = (
    <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
      <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs text-muted-foreground space-y-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex items-center gap-1.5 w-full text-left font-bold text-foreground/90 tracking-wider text-[10px] uppercase block mb-1">
            {summaryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Summary
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2">
      <div className="flex justify-between border-b border-border/10 pb-1.5">
        <span>Depth</span>
        <span className="font-mono font-semibold text-foreground/80">
          {options.maxDepth === 0 ? "No Limit" : `${options.maxDepth} levels`}
        </span>
      </div>
      
      {advancedModeEnabled && (
        <>
          <div className="flex justify-between border-b border-border/10 pb-1.5">
            <span>Hidden Files</span>
            <span className="font-semibold text-foreground/85">{options.includeHidden ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between border-b border-border/10 pb-1.5">
            <span>node_modules</span>
            <span className="font-semibold text-foreground/85">{options.includeVendored ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between border-b border-border/10 pb-1.5">
            <span>Empty Folders</span>
            <span className="font-semibold text-foreground/85">{options.skipEmptyFolders ? "Skip" : "Show"}</span>
          </div>
          <div className="flex justify-between border-b border-border/10 pb-1.5">
            <span>Show Files</span>
            <span className="font-semibold text-foreground/85">
              {options.includeFiles ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Extensions</span>
            <span className="font-mono bg-secondary font-semibold text-secondary-foreground px-2 py-0.5 rounded text-[10px]">
              {options.extensions.length > 0
                ? `${options.extensions.length} ext`
                : "All (*)"}
            </span>
          </div>
        </>
      )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border border-border/40 shadow-xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Filter className="h-5 w-5 text-muted-foreground/80" />
            Import Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            Choose how to scan your folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto pr-1 gm-scroll py-4">
          {basicOptions}
          {advancedModeEnabled && advancedOptions}
          {summary}
        </div>

        {/* FIXED: Explicitly defined spacing and layout rules prevents overlapping buttons */}
        <DialogFooter className="pt-4 border-t border-border/20 mt-2 flex flex-row items-center justify-end gap-3 w-full">
          <Button
            variant="outline"
            size="default"
            onClick={() => onOpenChange(false)}
            disabled={importing}
            className="text-xs border-border/80 text-foreground font-semibold hover:bg-muted/50 h-10 px-4 flex-1 sm:flex-initial"
          >
            Cancel
          </Button>
          <Button
            size="default"
            onClick={() => onConfirm(options)}
            disabled={importing}
            className="text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/10 active:scale-[0.99] transition-all gap-1.5 h-10 px-4 flex-1 sm:flex-initial"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4" />
                Import Folder
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}