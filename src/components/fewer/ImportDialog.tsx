"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Loader2,
  Filter,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border border-border/40 shadow-xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Filter className="h-5 w-5 text-muted-foreground/80" />
            Import Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            fewer does not store or upload any data. All data is processed locally.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 gm-scroll py-4">
          <ImportOptionsPanel
            options={options}
            onChange={(partial) => setOptions((prev) => ({ ...prev, ...partial }))}
            advancedModeEnabled={advancedModeEnabled}
          />
        </div>

        {/* FIXED: Explicitly defined spacing and layout rules prevents overlapping buttons */}
        <DialogFooter className="pt-4 border-t border-border/20 mt-2 flex flex-row items-center justify-end gap-3 w-full">
          <Button
            variant="outline"
            size="default"
            onClick={() => onOpenChange(false)}
            disabled={importing}
            className="text-xs border-border/80 text-foreground font-medium hover:bg-muted/50 h-10 px-4 flex-1 sm:flex-initial"
          >
            Cancel
          </Button>
          <Button
            size="default"
            onClick={() => onConfirm(options)}
            disabled={importing}
            className="text-xs font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/10 active:scale-[0.96] transition-[colors,transform] gap-1.5 h-10 px-4 flex-1 sm:flex-initial"
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