"use client";

import { useState } from "react";
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
import { FolderOpen, Loader2, Filter, Eye, EyeOff, Package, FolderX, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportOptions } from "@/lib/graphir/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/graphir/importOptions";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: ImportOptions) => void;
  /** Whether the import is currently running (shows spinner). */
  importing?: boolean;
}

/**
 * Import settings dialog shown before importing a directory.
 * Lets the user configure depth, hidden files, vendored dirs, extension
 * filters, and empty folder handling — like a 3D DCC importer shelf.
 */
export function ImportDialog({
  open,
  onOpenChange,
  onConfirm,
  importing = false,
}: ImportDialogProps) {
  const [options, setOptions] = useState<ImportOptions>({ ...DEFAULT_IMPORT_OPTIONS });

  // Reset to defaults when dialog opens
  // (using a key-based reset via the open prop change)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Import Settings
          </DialogTitle>
          <DialogDescription>
            Configure how the directory is scanned. These options help prevent
            importing thousands of files and crashing the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
          {/* Max Depth */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Max depth</Label>
              <span className="text-xs text-muted-foreground">
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
            <p className="text-[10px] text-muted-foreground">
              How many levels of subdirectories to scan. 0 = unlimited, 1 = top level only.
            </p>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            {/* Hidden files */}
            <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2">
                {options.includeHidden ? (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-sm">Include hidden files</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Files and folders starting with a dot (e.g. .gitignore, .env)
                  </p>
                </div>
              </div>
              <Switch
                checked={options.includeHidden}
                onCheckedChange={(v) => update({ includeHidden: v })}
              />
            </div>

            {/* Vendored dirs */}
            <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm">Include vendored dirs</Label>
                  <p className="text-[10px] text-muted-foreground">
                    node_modules, .git, dist, build, __pycache__, etc.
                  </p>
                </div>
              </div>
              <Switch
                checked={options.includeVendored}
                onCheckedChange={(v) => update({ includeVendored: v })}
              />
            </div>

            {/* Skip empty folders */}
            <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2">
                <FolderX className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm">Skip empty folders</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Don&apos;t create nodes for directories with no children
                  </p>
                </div>
              </div>
              <Switch
                checked={options.skipEmptyFolders}
                onCheckedChange={(v) => update({ skipEmptyFolders: v })}
              />
            </div>

            {/* Include files */}
            <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2">
                <FileIcon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm">Import files as nodes</Label>
                  <p className="text-[10px] text-muted-foreground">
                    When off, only the directory structure is imported (no file nodes)
                  </p>
                </div>
              </div>
              <Switch
                checked={options.includeFiles}
                onCheckedChange={(v) => update({ includeFiles: v })}
              />
            </div>
          </div>

          {/* Extension filter */}
          <div className="space-y-2">
            <Label className="text-sm">Filter by extension (optional)</Label>
            <p className="text-[10px] text-muted-foreground">
              Only import files with these extensions. Comma-separated, no dots.
              Leave empty to import all files. Example: ts, tsx, js, json
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
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={options.caseSensitiveExtensions}
                onCheckedChange={(v) => update({ caseSensitiveExtensions: v })}
                id="case-sensitive"
              />
              <Label htmlFor="case-sensitive" className="text-xs text-muted-foreground cursor-pointer">
                Case sensitive
              </Label>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">Import summary</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Depth</span>
              <span>{options.maxDepth === 0 ? "Unlimited" : `${options.maxDepth} levels`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hidden files</span>
              <span>{options.includeHidden ? "Included" : "Excluded"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendored dirs</span>
              <span>{options.includeVendored ? "Included" : "Excluded"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Empty folders</span>
              <span>{options.skipEmptyFolders ? "Skipped" : "Included"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Files</span>
              <span>{options.includeFiles ? "Imported as nodes" : "Folders only"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extension filter</span>
              <span>{options.extensions.length > 0 ? `${options.extensions.length} exts` : "All files"}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(options)}
            disabled={importing}
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white gap-1.5"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4" />
                Select Folder & Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
