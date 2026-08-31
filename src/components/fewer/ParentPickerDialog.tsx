"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogDragHandle,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";

/**
 * Folder picker for the batch "Move to Folder…" action. Opens via the
 * "fewer-batch-parent" window event. Lists every folder that can legally
 * receive the current selection (excludes the selected nodes themselves and
 * their subtrees) and reparents the selection in one undoable history entry.
 */
export function ParentPickerDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trigger = () => setOpen(true);
    window.addEventListener("fewer-batch-parent", trigger);
    return () => window.removeEventListener("fewer-batch-parent", trigger);
  }, []);

  // Capture the ids at open time — the menu selection is what the user moves.
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setIds(useGraphStore.getState().selectedNodeIds);
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  // Folders eligible as target: not part of the selection, not inside a
  // selected subtree (can't move a node under itself).
  const eligibleFolders = useMemo(() => {
    if (!open) return [];
    const blocked = new Set<string>(ids);
    const queue = [...ids];
    while (queue.length) {
      const nid = queue.shift()!;
      for (const e of edges) {
        if (e.source === nid && !blocked.has(e.target)) {
          blocked.add(e.target);
          queue.push(e.target);
        }
      }
    }
    const q = query.trim().toLowerCase();
    return nodes.filter(
      (n) =>
        n.data.type === "folder" &&
        !blocked.has(n.id) &&
        (!q || n.data.label.toLowerCase().includes(q) || n.data.path.toLowerCase().includes(q)),
    );
  }, [open, ids, nodes, edges, query]);

  const handlePick = (folderId: string) => {
    const result = useGraphStore.getState().parentNodesTo(ids, folderId);
    setOpen(false);
    const folder = nodes.find((n) => n.id === folderId);
    if (result.moved > 0) {
      toast({
        title: "Moved",
        description: `${result.moved} item${result.moved === 1 ? "" : "s"} moved into ${folder?.data.label ?? "folder"}`,
      });
    } else {
      toast({
        title: "Could not move",
        description: result.reason ?? "No eligible items",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dialogTitle="Move" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5"><DialogDragHandle />Move {ids.length} items to folder</DialogTitle>
          <DialogDescription>
            Pick a target folder. Items keep their sub-items; undo reverts the whole move.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search folders…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors border-border focus:border-foreground/40"
        />

        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {eligibleFolders.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No matching folders</div>
          ) : (
            eligibleFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handlePick(f.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm",
                  "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                )}
              >
                <Folder className="h-4 w-4 shrink-0 text-fewer-folder-icon" />
                <span className="truncate">{f.data.label}</span>
                <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">{f.data.path}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
