"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Tag as TagIcon } from "lucide-react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TAG_PALETTE } from "@/lib/fewer/tags";
import type { Tag } from "@/lib/fewer/tags";

/**
 * Sidebar panel: filter by tag, create/rename/recolor/delete tags (the tag
 * registry). The "Filter by tag" section mirrors the "By category" section in
 * StatsPanel — click a tag to hide everything that doesn't carry it; clicking
 * again clears the filter.
 */
export function TagsPanel() {
  const tags = useGraphStore((s) => s.tags);
  const nodes = useGraphStore((s) => s.nodes);
  const tagFilter = useGraphStore((s) => s.tagFilter);
  const toggleTagFilter = useGraphStore((s) => s.toggleTagFilter);
  const createTag = useGraphStore((s) => s.createTag);
  const updateTag = useGraphStore((s) => s.updateTag);
  const deleteTag = useGraphStore((s) => s.deleteTag);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  /** How many nodes carry each tag (folders + files). */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of tags) {
      let n = 0;
      for (const node of nodes) {
        if ((node.data.tagIds ?? []).includes(tag.id)) n++;
      }
      if (n > 0) counts.set(tag.id, n);
    }
    return counts;
  }, [tags, nodes]);

  const commitCreate = () => {
    const label = draft.trim();
    if (label) createTag(label, draftColor ?? undefined);
    setDraft("");
    setDraftColor(null);
    setCreating(false);
  };

  const startEdit = (id: string, label: string) => {
    setEditId(id);
    setEditDraft(label);
  };

  const commitEdit = () => {
    if (editId && editDraft.trim()) updateTag(editId, { label: editDraft.trim() });
    setEditId(null);
    setEditDraft("");
  };

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      {tags.length === 0 && !creating && (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          No tags yet. Tags highlight cards with a colored ring and let you
          filter the graph.
        </p>
      )}

      {/* ── Filter by tag (mirrors StatsPanel "By category") ── */}
      {tags.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              By tag
            </span>
            {tagFilter.length > 0 && (
              <button
                onClick={() => {
                  // Clear all active tag filters at once.
                  useGraphStore.getState().setTagFilter([]);
                }}
                className="rounded border border-border/50 px-1.5 py-0.5 text-[9px] font-semibold text-primary hover:bg-primary/10"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="space-y-1">
            {tags.map((tag) => {
              const count = tagCounts.get(tag.id) ?? 0;
              if (count === 0) return null;
              const total = nodes.length || 1;
              const pct = (count / total) * 100;
              const active = tagFilter.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTagFilter(tag.id)}
                  title={active ? `Showing only "${tag.label}" — click to clear` : `Show only "${tag.label}" cards`}
                  className={cn(
                    "block w-full space-y-1 rounded-md p-1 text-left transition-colors",
                    active ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30"
                        style={{ background: tag.color }}
                        aria-hidden="true"
                      />
                      <span className={cn("font-medium", active && "text-foreground")}>{tag.label}</span>
                      {active && <span className="text-[9px] font-semibold uppercase tracking-wide text-primary">Filtering</span>}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%`, background: tag.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tag management ── */}
      <div className="flex flex-col gap-1 w-full min-w-0">
        {tags.map((tag) => (
          <div key={tag.id} className="flex flex-col gap-1">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-card/30 px-2 py-1.5 group",
                colorPickerFor === tag.id ? "border-border/60" : "border-border/30",
              )}
            >
              {editId === tag.id ? (
                <TagEditor
                  color={tag.color}
                  value={editDraft}
                  onChange={setEditDraft}
                  onCommit={commitEdit}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <TagRow
                  label={tag.label}
                  color={tag.color}
                  pickerOpen={colorPickerFor === tag.id}
                  onTogglePicker={() =>
                    setColorPickerFor(colorPickerFor === tag.id ? null : tag.id)
                  }
                  onRename={() => startEdit(tag.id, tag.label)}
                  onDelete={() => deleteTag(tag.id)}
                />
              )}
            </div>
            {/* Theme-editor-style inline color picker (react-colorful), expanded
                under the tag row when its swatch is clicked. */}
            {colorPickerFor === tag.id && (
              <div className="rounded-lg border border-border/40 bg-background/60 p-2.5 space-y-2">
                <div className="overflow-hidden rounded-md">
                  <HexColorPicker
                    color={tag.color}
                    onChange={(c) => updateTag(tag.id, { color: c })}
                    style={{ width: "100%", height: 140 }}
                  />
                </div>
                <HexColorInput
                  color={tag.color}
                  onChange={(c) => updateTag(tag.id, { color: c })}
                  prefixed
                  className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setDraft("");
                }
              }}
              placeholder="Tag name"
              className="h-7 min-w-0 flex-1 rounded border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={commitCreate} title="Add">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TAG_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraftColor(color)}
                aria-label={`Color ${color}`}
                aria-pressed={draftColor === color}
                className={cn(
                  "h-4 w-4 rounded-full transition-transform",
                  draftColor === color ? "ring-2 ring-ring ring-offset-1 ring-offset-background scale-110" : "ring-1 ring-white/30",
                )}
                style={{ background: color }}
              />
            ))}
            <span className="text-[10px] text-muted-foreground/60">color (optional)</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/40 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add tag
        </button>
      )}
    </div>
  );
}

function TagRow({
  label,
  color,
  pickerOpen,
  onTogglePicker,
  onRename,
  onDelete,
}: {
  label: string;
  color: string;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {/* Swatch doubles as the picker toggle — same affordance as the theme editor. */}
      <button
        type="button"
        onClick={onTogglePicker}
        aria-expanded={pickerOpen}
        aria-label={`Color for ${label}`}
        title="Change color"
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full ring-1 ring-white/30 transition-transform hover:scale-110"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <button
        onClick={onRename}
        className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        title="Rename"
        aria-label={`Rename ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        title="Delete tag"
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function TagEditor({
  color,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  color: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30"
        style={{ background: color }}
        aria-hidden="true"
      />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        className="h-6 min-w-0 flex-1 rounded border border-border/50 bg-background px-1.5 text-xs outline-none focus:border-primary"
      />
      <button onClick={onCommit} className="text-muted-foreground hover:text-foreground">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
