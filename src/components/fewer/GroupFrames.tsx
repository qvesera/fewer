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
import { GROUP_HEADER_HEIGHT, groupBounds, groupPill, normalizeGroupColor } from "@/lib/fewer/groups";
import type { Group } from "@/lib/fewer/groups";
import type { FewerNode } from "@/lib/fewer/types";
import { TAG_FALLBACK_COLOR } from "@/lib/fewer/tags";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
  const [colorOpen, setColorOpen] = useState(false);
  // The picker reports every intermediate colour while dragging; we preview it
  // locally and commit on onChangeEnd so one drag stays ONE history entry
  // (setGroupColor records a `groups` op each call).
  const [draft, setDraft] = useState<string>(group.color ?? "");
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

  // Commit only when the draft normalizes to a real colour: typing "#12" and
  // closing must keep the previous colour rather than store junk (the validator
  // is the same one the snapshot uses on load).
  const commitDraft = () => {
    const valid = normalizeGroupColor(draft);
    if (valid && valid !== group.color) act().setGroupColor(group.id, valid);
  };
  const pickerColor = normalizeGroupColor(draft) ?? group.color ?? TAG_FALLBACK_COLOR;

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

        <ContextMenuContent
          className="w-52"
          // The Color… item opens a popover; without this the menu's focus
          // restore steals it back to the canvas on close.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ContextMenuItem onSelect={() => setEditing(true)}>Rename…</ContextMenuItem>
          <ContextMenuItem onSelect={() => setNoteOpen(true)}>Edit Note…</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              setDraft(group.color ?? "");
              setColorOpen(true);
            }}
          >
            Color…
          </ContextMenuItem>
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

      {/* Color picker: portalled to <body>, so it renders 1:1 in screen space
          instead of scaling with the canvas (the frame lives in flow coords). */}
      <Popover
        open={colorOpen}
        onOpenChange={(open) => {
          setColorOpen(open);
          if (!open) commitDraft();
        }}
      >
        <PopoverContent align="end" className="w-64 space-y-2 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Group color</div>
          <div className="overflow-hidden rounded-md">
            <HexColorPicker
              color={pickerColor}
              onChange={(c) => setDraft(c)}
              onChangeEnd={(c) => {
                setDraft(c);
                const valid = normalizeGroupColor(c);
                if (valid) act().setGroupColor(group.id, valid);
              }}
              aria-label="Group color"
              style={{ width: "100%", height: 140 }}
            />
          </div>
          <HexColorInput
            color={pickerColor}
            onChange={(c) => setDraft(c)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
            }}
            prefixed
            aria-label="Group color hex value"
            className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/60"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                act().setGroupColor(group.id, undefined);
              }}
              className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Reset to default
            </button>
            <button
              type="button"
              onClick={() => setColorOpen(false)}
              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
