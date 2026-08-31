"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { applyBatchRename } from "@/lib/fewer/batchRename";

/** Full display name of a node — label plus its stored extension, if any. */
const fullName = (n: { data: { label: string; extension?: string } }) =>
  n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;

/**
 * Batch rename for multi-selection. Opens via the "fewer-batch-rename" window
 * event (fired by the context menu's batch section). Applies a find/replace +
 * prefix/suffix + numbering transform to every selected node's label in one
 * undoable history entry.
 */
export function BatchRenameDialog() {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const { toast } = useToast();
  const [replace, setReplace] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [numbered, setNumbered] = useState(false);

  useEffect(() => {
    const trigger = () => setOpen(true);
    window.addEventListener("fewer-batch-rename", trigger);
    return () => window.removeEventListener("fewer-batch-rename", trigger);
  }, []);

  // Capture the ids at open time — the menu selection is what the user acts on.
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) setIds(useGraphStore.getState().selectedNodeIds);
  }, [open]);

  const nodes = useGraphStore((s) => s.nodes);

  const options = useMemo(
    () => ({ find, replace, prefix, suffix, numbered }),
    [find, replace, prefix, suffix, numbered],
  );

  // Live preview of the first few affected items.
  const preview = useMemo(() => {
    if (!open) return [];
    return ids
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        before: fullName(n),
        after: applyBatchRename(fullName(n), options, ids.indexOf(n.id)),
      }));
  }, [open, ids, nodes, options]);

  const hasChange = !!find || !!replace || !!prefix || !!suffix || numbered;

  const handleApply = () => {
    const renamed = useGraphStore.getState().renameNodes(ids, (node, i) =>
      applyBatchRename(fullName(node), options, i),
    );
    setOpen(false);
    toast({
      title: renamed > 0 ? "Renamed" : "Nothing to rename",
      description:
        renamed > 0
          ? `${renamed} item${renamed === 1 ? "" : "s"} renamed`
          : "No labels changed (new names may already be taken)",
      ...(renamed === 0 ? { variant: "destructive" as const } : {}),
    });
    // Reset for next open
    setFind("");
    setReplace("");
    setPrefix("");
    setSuffix("");
    setNumbered(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dialogTitle="Rename" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {ids.length} items</DialogTitle>
          <DialogDescription>
            Applies to item names. Find &amp; replace also matches file extensions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="batch-find">Find</Label>
              <Input id="batch-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="text to replace" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-replace">Replace with</Label>
              <Input id="batch-replace" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="replacement" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-prefix">Prefix</Label>
              <Input id="batch-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="prepended" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-suffix">Suffix</Label>
              <Input id="batch-suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="appended" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={numbered}
              onChange={(e) => setNumbered(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
            />
            Number items (name 1, name 2, …)
          </label>

          {preview.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-2 text-xs space-y-1">
              {preview.map((p) => (
                <div key={p.id} className="flex items-center gap-1 truncate">
                  <span className="truncate text-muted-foreground">{p.before}</span>
                  <span className="shrink-0 opacity-50">→</span>
                  <span className={cn("truncate font-medium", !hasChange && "opacity-50")}>
                    {p.after}
                  </span>
                </div>
              ))}
              {ids.length > preview.length && (
                <div className="text-[10px] text-muted-foreground">+ {ids.length - preview.length} more</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!hasChange}>
            Rename {ids.length} items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
