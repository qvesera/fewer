"use client";

import { useState, useRef, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileJson,
  FolderTree,
  FileTerminal,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import type { TreeEntry } from "@/lib/fewer/types";

interface ImportFromFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (tree: TreeEntry) => void;
}

type Format = "json" | "tree" | "script";

const ALL_FORMATS: {
  value: Format;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
}[] = [
  {
    value: "tree",
    label: "ASCII Tree Format",
    desc: "Paste formatted directory structural unicode text",
    icon: FolderTree,
    accept: ".txt",
  },
  {
    value: "json",
    label: "JSON Graph Payload",
    desc: "Import exported graph node & edge snapshots",
    icon: FileJson,
    accept: ".json",
  },
  {
    value: "script",
    label: "Shell Creation Script",
    desc: "Batch generate trees from sequence creation statements",
    icon: FileTerminal,
    accept: ".sh,.bat",
  },
];

const PLACEHOLDERS: Record<Format, string> = {
  json: `{\n  "nodes": [...],\n  "edges": [...]\n}`,
  tree: `root_project_folder/\n├── src/\n│   ├── App.tsx\n│   └── main.tsx\n└── package.json`,
  script: `mkdir -p "src/components"\nmkdir -p "src/hooks"\nmkdir -p "public"`,
};

export function ImportFromFileDialog({
  open,
  onOpenChange,
  onImport,
}: ImportFromFileDialogProps) {
  const [format, setFormat] = useState<Format>("tree");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const reset = () => {
    setContent("");
    setError(null);
    setFormat("tree");
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  useEffect(() => {
    if (!advancedModeEnabled && format !== "tree") {
      setFormat("tree");
    }
  }, [advancedModeEnabled, format]);

  const activeFormats = advancedModeEnabled 
    ? ALL_FORMATS 
    : ALL_FORMATS.filter((f) => f.value === "tree");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (advancedModeEnabled && ext === "json") {
        setFormat("json");
      } else if (advancedModeEnabled && (ext === "sh" || ext === "bat")) {
        setFormat("script");
      } else {
        setFormat("tree");
      }
    };
    reader.onerror = () => setError("Failed to parse file");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) {
      setError("Provide structural script commands or load file first.");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const { parseImportFile } = await import("@/lib/fewer/parsers");
      const tree = parseImportFile(content, format);
      onImport(tree);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed parsing file payload structural rules.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-md border border-border/40 shadow-xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Upload className="h-5 w-5 text-muted-foreground/80" />
            Import from File
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            fewer does not store or upload any data. All data is processed locally.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto pr-1 gm-scroll py-4">
          {/* Format selector */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Active Document Specification</Label>
            
            {/* FIXED: Added inner container padding (p-1 -m-1) to ensure the active blue focus ring does not get clipped */}
            <div className="p-1 -m-1">
              <div className={cn("grid gap-2", advancedModeEnabled ? "grid-cols-3" : "grid-cols-1")}>
                  {activeFormats.map((f) => {
                    const Icon = f.icon;
                    const active = format === f.value;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFormat(f.value)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border p-3.5 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300 shadow-sm"
                            : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                        )}
                      >
                        <Icon className="h-4.5 w-4.5 opacity-85" />
                        <span className="text-xs font-medium text-center leading-tight">
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          {/* File upload panel */}
          <div className="pt-0.5">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALL_FORMATS.find((f) => f.value === format)?.accept}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-border/80 text-foreground hover:bg-muted/40 font-medium text-xs h-10"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              Upload Source Code Document
            </Button>
          </div>

          {/* Paste area configuration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-medium">
                Or write raw{" "}
                {format === "json"
                  ? "JSON array schema"
                  : format === "tree"
                    ? "ASCII text layers"
                    : "shell tokens"}{" "}
                directly below
              </Label>
            </div>
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
              }}
              placeholder={PLACEHOLDERS[format]}
              className="text-xs font-mono font-medium min-h-[160px] max-h-[260px] bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-ring gm-scroll leading-relaxed p-3.5"
            />
          </div>

          {/* Error notice banner */}
          {error && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-400 dark:text-red-300 leading-normal font-medium">
              {error}
            </div>
          )}
        </div>

        {/* FIXED: Explicit flexbox configuration and gap parameters prevents touching buttons */}
        <DialogFooter className="pt-4 border-t border-border/20 mt-2 flex flex-row items-center justify-end gap-3 w-full">
          <Button 
            variant="outline" 
            size="default"
            onClick={handleClose} 
            disabled={importing}
            className="text-xs border-border/80 text-foreground font-medium hover:bg-muted/50 h-10 px-4 flex-1 sm:flex-initial"
          >
            Cancel
          </Button> 
          <Button
            size="default"
            onClick={handleImport}
            disabled={importing || !content.trim()}
            className="text-xs font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/10 active:scale-[0.99] transition-all gap-1.5 h-10 px-4 flex-1 sm:flex-initial"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Build Workspace Graph
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}