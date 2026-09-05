"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "child" | "standalone" | "parent";
}

const shakeStyle = `
@keyframes dialog-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
`;

export function AddNodeDialog({ open, onOpenChange, mode }: AddNodeDialogProps) {
  const addNode = useGraphStore((s) => s.addNode);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const addParentNode = useGraphStore((s) => s.addParentNode);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [type, setType] = useState<"folder" | "file">("folder");
  const [shake, setShake] = useState(false);

  // Reset and focus when dialog opens
  useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setName("");
        setType("folder");
        setShake(false);
      });
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Real-time duplicate check
  const displayName = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const ext = type === "file" ? (trimmed.includes(".") ? "" : "") : "";
    if (type === "file") {
      const dot = trimmed.lastIndexOf(".");
      if (dot > 0) return trimmed.slice(0, dot);
      return trimmed;
    }
    return trimmed;
  }, [name, type]);

  const isDuplicate = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    // Compare full display names (with extension for files)
    const inputFullName = trimmed.toLowerCase();

    if (mode === "child") {
      const parentId = selectedNodeIds[0] ?? null;
      if (!parentId) return false;
      const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target);
      return nodes.some((n) => {
        if (!siblingIds.includes(n.id)) return false;
        const nFull = n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;
        return nFull.toLowerCase() === inputFullName;
      });
    }

    if (mode === "parent") {
      const targetId = selectedNodeIds[0] ?? null;
      if (!targetId) return false;
      // The new folder becomes a sibling of the target node (child of its
      // current parent, or a root-level node if the target is unparented).
      const parentEdge = edges.find((e) => e.target === targetId);
      const siblingNodeIds = parentEdge
        ? edges.filter((e) => e.source === parentEdge.source).map((e) => e.target)
        : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
      return nodes.some((n) => {
        if (!siblingNodeIds.includes(n.id)) return false;
        const nFull = n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;
        return nFull.toLowerCase() === inputFullName;
      });
    }

    // Standalone: check root-level nodes
    return nodes
      .filter((n) => !edges.some((e) => e.target === n.id))
      .some((n) => {
        const nFull = n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;
        return nFull.toLowerCase() === inputFullName;
      });
  }, [name, type, mode, selectedNodeIds, nodes, edges]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleConfirm = () => {
    const trimmed = name.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    if (isDuplicate) {
      triggerShake();
      return;
    }
    if (mode === "child") {
      addNode(selectedNodeIds[0] ?? null, trimmed, type);
      onOpenChange(false);
      toast({
        title: type === "folder" ? "Folder added" : "File added",
        description: `"${trimmed}" added to folder`,
      });
    } else if (mode === "parent") {
      const targetId = selectedNodeIds[0] ?? null;
      const result = targetId ? addParentNode(targetId, trimmed) : null;
      if (!result || !result.ok) {
        triggerShake();
        return;
      }
      onOpenChange(false);
      toast({
        title: "Parent folder added",
        description: `"${trimmed}" is now the parent card`,
      });
    } else {
      addStandaloneNode(trimmed, type, { x: 1000, y: 600 });
      onOpenChange(false);
      toast({
        title: type === "folder" ? "Folder added" : "File added",
        description: `"${trimmed}" added to canvas`,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === "parent") {
      // Parent cards are always folders — no type switching.
      if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
      return;
    }
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
    <>
      <style>{shakeStyle}</style>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dialogTitle="Add Card" className="sm:max-w-md">
          <div ref={contentRef} style={shake ? { animation: "dialog-shake 0.5s ease-in-out" } : undefined}>
          <DialogHeader>
            <DialogTitle>
              {mode === "child" ? "Add child card" : mode === "parent" ? "Add parent card" : "Add card"}
            </DialogTitle>
            <DialogDescription>
              {mode === "child"
                ? "Creates a new card as a child of the selected folder."
                : mode === "parent"
                  ? "Creates a new folder that becomes the parent of the selected card."
                  : "Creates a new root card on the canvas."}
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
                placeholder={mode === "parent" || type === "folder" ? "e.g. new-folder" : "e.g. notes.md"}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors",
                  isDuplicate && name.trim()
                    ? "border-red-400 ring-1 ring-red-400/40"
                    : "border-border focus:border-foreground/40"
                )}
              />
              {isDuplicate && name.trim() && (
                <div className="flex items-center gap-1.5 text-[11px] text-red-400 animate-[tutorial-fade-in_0.2s_ease-out]">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>A node with this name already exists here</span>
                </div>
              )}
            </div>

            {/* Type toggle: use ← → arrows to switch, Enter to confirm */}
            {mode === "parent" ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                📁 Parent cards are always folders
              </div>
            ) : (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("folder")}
                  className={cn(
                    "rounded-lg border p-3 text-sm transition-colors",
                    type === "folder"
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-orange-400/40"
                      : "border-border/40 hover:bg-muted/40"
                  )}
                >
                  📁 Folder
                </button>
                <button
                  type="button"
                  onClick={() => setType("file")}
                  className={cn(
                    "rounded-lg border p-3 text-sm transition-colors",
                    type === "file"
                      ? "border-purple-400 bg-purple-500/10 text-primary ring-2 ring-purple-400/40"
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
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isDuplicate && !!name.trim()}
              className={cn(
                "text-white",
                type === "folder" || mode === "parent"
                  ? "bg-gradient-to-r from-primary to-primary hover:opacity-90"
                  : "bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
              )}
            >
              {mode === "parent" ? "Create parent folder" : type === "folder" ? "Create folder" : "Create file"}
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}