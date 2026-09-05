"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TAG_PALETTE } from "@/lib/fewer/tags";

/**
 * Sidebar panel: create/rename/recolor/delete tags (the tag registry). Deleting
 * a tag strips it from every node. Tag assignment itself happens in each
 * node's context menu — this panel manages the shared palette.
 */
export function TagsPanel() {
  const tags = useGraphStore((s) => s.tags);
  const createTag = useGraphStore((s) => s.createTag);
  const updateTag = useGraphStore((s) => s.updateTag);
  const deleteTag = useGraphStore((s) => s.deleteTag);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

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
