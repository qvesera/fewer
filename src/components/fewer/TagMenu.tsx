"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import {
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { TAG_PALETTE } from "@/lib/fewer/tags";
import { selectByTag } from "@/lib/fewer/batchSelect";

/**
 * "Tags" submenu inside a node's context menu. Lists every tag as a checkbox
 * (checked = assigned to this node) and a "+ New tag" row that creates one and
 * immediately assigns it. Toggling is a single store action.
 */
export function TagMenu({
  nodeId,
  nodeTagIds,
}: {
  nodeId: string;
  nodeTagIds: string[];
}) {
  const tags = useGraphStore((s) => s.tags);
  const toggleNodeTag = useGraphStore((s) => s.toggleNodeTag);
  const createTag = useGraphStore((s) => s.createTag);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(null);

  const commitDraft = (colorOverride?: string) => {
    const label = draft.trim();
    if (!label) {
      setCreating(false);
      setDraft("");
      setDraftColor(null);
      return;
    }
    // An explicit color (from the swatch) wins; otherwise fall through to the
    // palette default in createTag. We must NOT auto-create, because an empty
    // draftColor here is indistinguishable from "user didn't pick a color".
    const tag = createTag(label, colorOverride ?? undefined);
    toggleNodeTag(nodeId, tag.id);
    setDraft("");
    setDraftColor(null);
    setCreating(false);
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="cursor-pointer">
        Tags
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-52">
        {tags.length === 0 && !creating && (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            No tags yet — create one below.
          </div>
        )}
        {tags.map((tag) => {
          const checked = nodeTagIds.includes(tag.id);
          return (
            <ContextMenuCheckboxItem
              key={tag.id}
              checked={checked}
              onSelect={(e) => {
                e.preventDefault();
                toggleNodeTag(nodeId, tag.id);
              }}
              className="cursor-pointer"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
                style={{ background: tag.color }}
                aria-hidden="true"
              />
              <span className="truncate">{tag.label}</span>
            </ContextMenuCheckboxItem>
          );
        })}
        {creating ? (
          <div className="flex flex-col gap-1.5 px-2 py-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitDraft();
                if (e.key === "Escape") {
                  setCreating(false);
                  setDraft("");
                  setDraftColor(null);
                }
              }}
              placeholder="Tag name"
              className="h-7 w-full rounded border border-border/50 bg-background px-1.5 text-xs outline-none focus:border-primary"
            />
            <div
              className="flex flex-wrap items-center gap-1"
              role="radiogroup"
              aria-label="Tag color"
            >
              {TAG_PALETTE.map((color) => {
                const active = draftColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => commitDraft(color)}
                    aria-label={`Color ${color}`}
                    aria-pressed={active}
                    className={cn(
                      "h-4 w-4 rounded-full transition-transform",
                      active
                        ? "ring-2 ring-ring ring-offset-1 ring-offset-background scale-110"
                        : "ring-1 ring-white/30",
                    )}
                    style={{ background: color }}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Uncheck a tag above to remove it from this card.
            </p>
          </div>
        ) : (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setCreating(true);
            }}
            className="cursor-pointer text-muted-foreground"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            New tag
          </ContextMenuItem>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * "By Tag" submenu that selects every card carrying a chosen tag. Rendered inside
 * the "Select" submenu of file/batch menus and standalone on folder menus (where
 * it is labeled "Select by Tag"). Replaces the current selection, mirroring the
 * other selection helpers (By Type / By Category / Select Descendants).
 */
export function SelectByTagSubmenu({ label = "Select by Tag" }: { label?: string }) {
  const tags = useGraphStore((s) => s.tags);
  const { toast } = useToast();

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="cursor-pointer">{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
        {tags.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            No tags yet
          </div>
        ) : (
          tags.map((tag) => (
            <ContextMenuItem
              key={tag.id}
              onSelect={() => {
                const store = useGraphStore.getState();
                const ids = selectByTag(store.nodes, tag.id);
                store.setSelectedNodeIds(ids);
                toast({
                  title: "Selected by tag",
                  description: `${ids.length} card${ids.length === 1 ? "" : "s"} tagged "${tag.label}"`,
                });
              }}
              className="cursor-pointer"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
                style={{ background: tag.color }}
                aria-hidden="true"
              />
              <span className="truncate">{tag.label}</span>
            </ContextMenuItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
