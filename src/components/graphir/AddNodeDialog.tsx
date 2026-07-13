"use client";

import { useState, useEffect, useRef } from "react";
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
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "child" | "standalone";
}

export function AddNodeDialog({ open, onOpenChange, mode }: AddNodeDialogProps) {
  const addNode = useGraphStore((s) => s.addNode);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<"folder" | "file">("folder");

  // Reset and focus when dialog opens
  useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setName("");
        setType("folder");
      });
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleConfirm = () => {
    const trimmed = name.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    if (mode === "child") {
      addNode(selectedNodeIds[0] ?? null, trimmed, type);
    } else {
      addStandaloneNode(trimmed, type, { x: 1000, y: 600 });
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Left/Right arrows toggle between File and Folder
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setType("folder");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setType("file");
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "child" ? "Add child node" : "Add node"}
          </DialogTitle>
          <DialogDescription>
            {mode === "child"
              ? "Creates a new node as a child of the selected folder."
              : "Creates a new root node on the canvas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2" onKeyDown={handleKeyDown}>
          {/* Name input */}
          <div className="space-y-1.5">
            <Label htmlFor="node-name">Name</Label>
            <input
              ref={inputRef}
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "folder" ? "e.g. new-folder" : "e.g. notes.md"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Type toggle — use ← → arrows to switch, Enter to confirm */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType("folder")}
                className={cn(
                  "rounded-lg border p-3 text-sm transition-all",
                  type === "folder"
                    ? "border-orange-400 bg-orange-500/10 text-orange-300 ring-2 ring-orange-400/40"
                    : "border-border/40 hover:bg-muted/40"
                )}
              >
                📁 Folder
              </button>
              <button
                onClick={() => setType("file")}
                className={cn(
                  "rounded-lg border p-3 text-sm transition-all",
                  type === "file"
                    ? "border-purple-400 bg-purple-500/10 text-purple-300 ring-2 ring-purple-400/40"
                    : "border-border/40 hover:bg-muted/40"
                )}
              >
                📄 File
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use ← → arrow keys to switch type · Enter to create
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className={cn(
              "text-white",
              type === "folder"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                : "bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
            )}
          >
            {type === "folder" ? "Create folder" : "Create file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
