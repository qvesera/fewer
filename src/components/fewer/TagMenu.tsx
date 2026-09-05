"use client";

import { useState } from "react";
import { Plus, Tag as TagIcon } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import {
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuItem,
} from "@/components/ui/context-menu";

/**
 * "Tags" submenu inside a node's context menu. Lists every tag as a checkbox
 * (checked = assigned to this node) and a "+ New tag" row that creates one and
 * immediately assigns it. Toggling is a single store action.
 */
export function TagMenu({ nodeId, nodeTagIds }: { nodeId: string; nodeTagIds: string[] }) {
  const tags = useGraphStore((s) => s.tags);
  const toggleNodeTag = useGraphStore((s) => s.toggleNodeTag);
  const createTag = useGraphStore((s) => s.createTag);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const label = draft.trim();
    if (!label) {
      setCreating(false);
      return;
    }
    const tag = createTag(label);
    toggleNodeTag(nodeId, tag.id);
    setDraft("");
    setCreating(false);
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="cursor-pointer">
        <TagIcon className="mr-2 h-3.5 w-3.5" />
        Tags
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
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
              className="cursor-pointer pl-8"
            >
              <span
                className="absolute left-2.5 h-2.5 w-2.5 rounded-full"
                style={{ background: tag.color }}
                aria-hidden="true"
              />
              {tag.label}
            </ContextMenuCheckboxItem>
          );
        })}
        {creating ? (
          <div className="flex items-center gap-1 px-2 py-1">
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
                }
              }}
              onBlur={commitDraft}
              placeholder="Tag name"
              className="h-7 w-full rounded border border-border/50 bg-background px-1.5 text-xs outline-none focus:border-primary"
            />
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
