"use client";

// Canvas group frames (T-125): the gray box a group draws behind its member
// cards, with the title strip above it. Rendered through ViewportPortal so the
// layer lives in flow coordinates (it pans/zooms with the canvas) and stays out
// of `nodes` entirely — layout, search, stats and export never see it.
//
// Only the header strip takes pointer events: the gray area itself is inert, so
// dragging, selecting and right-clicking cards inside a group behave exactly as
// they do outside one.
import { useState, type ReactNode } from "react";
import { ViewportPortal } from "@xyflow/react";
import { ChevronDown, ChevronRight, StickyNote, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { GROUP_HEADER_HEIGHT, groupBounds, groupPill } from "@/lib/fewer/groups";
import type { Group } from "@/lib/fewer/groups";
import type { FewerNode } from "@/lib/fewer/types";
import { TAG_FALLBACK_COLOR, TAG_PALETTE } from "@/lib/fewer/tags";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/fewer/plural";

export function GroupFrames(): ReactNode {
  const groups = useGraphStore((s) => s.groups) ?? [];
  const nodes = useGraphStore((s) => s.nodes);
  if (groups.length === 0) return null;
  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute left-0 top-0 h-0 w-0">
        {groups.map((group) => (
          <GroupFrame key={group.id} group={group} nodes={nodes} />
        ))}
      </div>
    </ViewportPortal>
  );
}

function GroupFrame({ group, nodes }: { group: Group; nodes: FewerNode[] }): ReactNode {
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const bounds = groupBounds(nodes, group.memberIds);
  // Every member gone (deleted, or the graph changed under it): nothing to draw.
  if (!bounds) return null;
  const box = group.collapsed ? groupPill(bounds) : bounds;

  // Colored frames tint border + fill + header from the same hex; the default
  // stays slate so a plain group reads exactly as it did before colors existed.
  const accent = group.color ?? TAG_FALLBACK_COLOR;
  const tinted = Boolean(group.color);
  const frameStyle = tinted
    ? { borderColor: accent, background: `${accent}14` }
    : undefined;
  const headerStyle = tinted
    ? { height: GROUP_HEADER_HEIGHT, borderColor: `${accent}55`, background: `${accent}22` }
    : { height: GROUP_HEADER_HEIGHT };

  const act = () => useGraphStore.getState();

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      data-group-id={group.id}
    >
      {/* The gray area — inert, so cards inside it stay draggable/selectable. */}
      <div
        className={tinted ? "absolute inset-0 rounded-2xl border" : "absolute inset-0 rounded-2xl border border-border/50 bg-muted/35"}
        style={frameStyle}
      />

      {/* Right-click the header for the group menu; the body stays out of the way. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={
              tinted
                ? "pointer-events-auto absolute left-0 right-0 top-0 flex items-center gap-1 rounded-t-2xl border-b px-2"
                : "pointer-events-auto absolute left-0 right-0 top-0 flex items-center gap-1 rounded-t-2xl border-b border-border/40 bg-muted/70 px-2"
            }
            style={headerStyle}
          >
        <button
          type="button"
          onClick={() => useGraphStore.getState().toggleGroupCollapsed(group.id)}
          title={group.collapsed ? "Expand group" : "Collapse group"}
          aria-label={group.collapsed ? "Expand group" : "Collapse group"}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        >
          {group.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {editing ? (
          <input
            autoFocus
            defaultValue={group.title}
            aria-label="Group title"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-xs font-semibold text-foreground outline-none ring-1 ring-primary/60"
            onBlur={(e) => {
              useGraphStore.getState().renameGroup(group.id, e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          // The title carries the note on hover — the group's own annotation.
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                title="Rename group"
                onDoubleClick={() => setEditing(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditing(true);
                  }
                }}
                className="min-w-0 flex-1 cursor-text truncate px-1 text-xs font-semibold text-foreground"
              >
                {group.title}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap text-left">
              {group.note || "No note yet — click the note icon to add one"}
            </TooltipContent>
          </Tooltip>
        )}

        <span className="shrink-0 text-[10px] text-muted-foreground">
          {plural(group.memberIds.length, "card")}
        </span>

        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={group.note ? "Edit note" : "Add a note"}
              aria-label={group.note ? "Edit note" : "Add a note"}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <StickyNote className={group.note ? "h-3.5 w-3.5 text-foreground/70" : "h-3.5 w-3.5"} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Note</div>
            <Textarea
              defaultValue={group.note}
              placeholder="What should you remember about this group?"
              rows={4}
              aria-label="Group note"
              onBlur={(e) => useGraphStore.getState().setGroupNote(group.id, e.target.value)}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => useGraphStore.getState().removeGroup(group.id)}
          title="Ungroup (undo with Ctrl+Z)"
          aria-label="Ungroup"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => setEditing(true)}>Rename…</ContextMenuItem>
          <ContextMenuItem onSelect={() => setNoteOpen(true)}>Edit Note…</ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              {TAG_PALETTE.map((c) => (
                <ContextMenuItem
                  key={c}
                  onSelect={() => act().setGroupColor(group.id, c)}
                  className="flex items-center gap-2"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-border/40"
                    style={{ background: c }}
                  />
                  {c}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => act().setGroupColor(group.id, undefined)}>
                Default
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={() => act().toggleGroupCollapsed(group.id)}>
            {group.collapsed ? "Expand" : "Collapse"}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => useGraphStore.setState({ selectedNodeIds: [...group.memberIds] })}
          >
            Select Members
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => act().removeGroup(group.id)}
            className="text-destructive focus:bg-red-500/10"
          >
            Ungroup
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
