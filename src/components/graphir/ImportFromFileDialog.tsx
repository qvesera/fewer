"use client";

import { useState, useRef } from "react";
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
import { Upload, FileJson, FolderTree, FileTerminal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeEntry } from "@/lib/graphir/types";

interface ImportFromFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (tree: TreeEntry) => void;
}

type Format = "json" | "tree" | "script";

const FORMATS: {
  value: Format;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accept: string;
}[] = [
  {
    value: "json",
    label: "JSON Graph",
    desc: "Previously exported JSON graph state",
    icon: FileJson,
    accept: ".json",
  },
  {
    value: "tree",
    label: "ASCII Tree",
    desc: "Unicode tree (├── └── │) from Dir Tree export",
    icon: FolderTree,
    accept: ".txt",
  },
  {
    value: "script",
    label: "Shell / Batch Script",
    desc: "mkdir commands from Dir Script export",
    icon: FileTerminal,
    accept: ".sh,.bat",
  },
];

const PLACEHOLDERS: Record<Format, string> = {
  json: `{\n  "nodes": [...],\n  "edges": [...]\n}`,
  tree: `root/\n├── src/\n│   ├── App.tsx\n│   └── main.tsx\n└── package.json`,
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

  const reset = () => {
    setContent("");
    setError(null);
    setFormat("tree");
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);

      // Auto-detect format from file extension
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "json") setFormat("json");
      else if (ext === "sh" || ext === "bat") setFormat("script");
      else setFormat("tree");
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) {
      setError("Please paste content or upload a file");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const { parseImportFile } = await import("@/lib/graphir/parsers");
      const tree = parseImportFile(content, format);
      onImport(tree);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse content");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import from File
          </DialogTitle>
          <DialogDescription>
            Upload or paste a JSON graph, ASCII tree, or shell/batch script to
            build the graph without importing a directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format selector */}
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => {
              const Icon = f.icon;
              const active = format === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 transition-all",
                    active
                      ? "border-orange-400 bg-orange-500/10 text-orange-300"
                      : "border-border/40 hover:bg-muted/40"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium text-center">{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* File upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={FORMATS.find((f) => f.value === format)?.accept}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Choose File
            </Button>
          </div>

          {/* Paste area */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Or paste {format === "json" ? "JSON" : format === "tree" ? "tree text" : "script"} here
            </Label>
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
              }}
              placeholder={PLACEHOLDERS[format]}
              className="text-xs font-mono min-h-[160px] max-h-[300px]"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || !content.trim()}
            className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white"
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Build Graph
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
