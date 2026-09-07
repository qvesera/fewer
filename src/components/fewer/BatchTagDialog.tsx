"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { TAG_PALETTE } from "@/lib/fewer/tags";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Tag picker for the batch "Tags…" action. Opens via the "fewer-batch-tags"
 * window event. Lists every tag as a checkbox: checked = all selected nodes
 * carry it, unselected = none do, mixed = some do (shows an indeterminate
 * dash). Toggling assigns or removes the tag across the whole selection in
 * one store call. A "+ New tag" row creates a tag and immediately assigns it.
 */
export function BatchTagDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trigger = () => setOpen(true);
    window.addEventListener("fewer-batch-tags", trigger);
    return () => window.removeEventListener("fewer-batch-tags", trigger);
  }, []);

  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setIds(useGraphStore.getState().selectedNodeIds);
      setCreating(false);
      setDraft("");
    }
  }, [open]);

  const tags = useGraphStore((s) => s.tags);
  const nodes = useGraphStore((s) => s.nodes);
  const assignTagToNodes = useGraphStore((s) => s.assignTagToNodes);
  const unassignTagFromNodes = useGraphStore((s) => s.unassignTagFromNodes);
  const createTag = useGraphStore((s) => s.createTag);

  // How many of the selected nodes carry each tag.
  const counts = (tagId: string) => {
    let total = 0;
    let have = 0;
    for (const n of nodes) {
      if (!ids.includes(n.id)) continue;
      total++;
      if (n.data.tagIds?.includes(tagId)) have++;
    }
    return { have, total };
  };

  const commitDraft = () => {
    const label = draft.trim();
    if (!label) {
      setCreating(false);
      return;
    }
    const tag = createTag(label);
    assignTagToNodes(ids, tag.id);
    toast({
      title: "Tag added",
      description: `"${tag.label}" assigned to ${ids.length} item${ids.length === 1 ? "" : "s"}`,
    });
    setDraft("");
    setCreating(false);
  };

  return (
    <dialog
      open={open}
      onClose={() => setOpen(false)}
      className="fixed inset-0 z-[60] m-0 h-full w-full max-h-none max-w-none bg-transparent p-0"
    >
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div className="relative z-[70] w-full max-w-sm rounded-2xl border border-border/50 bg-popover p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tag {ids.length} selected items</h2>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {tags.length === 0 && !creating && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No tags yet — create one below.</div>
            )}
            {tags.map((tag) => {
              const { have, total } = counts(tag.id);
              const checked = have === total && total > 0;
              const indeterminate = have > 0 && have < total;
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (have > 0) unassignTagFromNodes(ids, tag.id);
                    else assignTagToNodes(ids, tag.id);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <Checkbox checked={checked} data-indeterminate={indeterminate} className="pointer-events-none h-4 w-4" />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
                    style={{ background: tag.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{tag.label}</span>
                  {total > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {have}/{total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-border/40 pt-3">
            {creating ? (
              <div className="flex gap-2">
                <input
                  ref={draftRef}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitDraft();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setDraft("");
                    }
                  }}
                  onBlur={commitDraft}
                  placeholder="Tag name"
                  className="h-8 flex-1 rounded border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary"
                />
                <div className="flex flex-wrap items-center gap-1">
                  {TAG_PALETTE.map((color) => (
                    <span key={color} className="h-4 w-4 rounded-full ring-1 ring-white/30" style={{ background: color }} />
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setCreating(true);
                  setTimeout(() => draftRef.current?.focus(), 30);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/60"
              >
                <Plus className="h-3.5 w-3.5" />
                New tag
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

