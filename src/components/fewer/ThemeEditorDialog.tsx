"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Palette, Save, X, GripVertical, Minus, Trash2, Loader2, Check, Pencil } from "lucide-react";
import { toCssColor } from "@/lib/fewer/themeColors";
import { type CustomTheme, type CustomThemeColor, type SavedTheme } from "@/lib/fewer/types";
import { HexAlphaColorPicker, HexColorInput } from "react-colorful";
import { THEME_PRESETS } from "@/lib/fewer/themePresets";
import { safeText, validateTextField } from "@/lib/fewer/textValidation";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { MinimizedDialogPill } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  TOP_OFFSET,
  THEME_EDITOR_SECTIONS,
  clampPosition,
  colorOpacityToHexAlpha,
  dialogWidth,
  hexAlphaToColorOpacity,
} from "@/lib/fewer/themeEditor";

export function ThemeEditorDialog() {
  const themeEditorOpen = useGraphStore((s) => s.themeEditorOpen);
  const setThemeEditorOpen = useGraphStore((s) => s.setThemeEditorOpen);
  const customTheme = useGraphStore((s) => s.customTheme);
  const setCustomTheme = useGraphStore((s) => s.setCustomTheme);
  const resetCustomTheme = useGraphStore((s) => s.resetCustomTheme);
  const [expandedPicker, setExpandedPicker] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Saved-to-cloud custom themes (grouped under "Custom" in the preset list).
  // Lazy-loaded only when the user opens the preset dropdown — not on mount.
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadThemes = useCallback(async () => {
    if (!user) {
      setSavedThemes([]);
      return;
    }
    setThemesLoading(true);
    try {
      const res = await fetch("/api/themes");
      if (res.status === 401) {
        setSavedThemes([]);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      if (Array.isArray(json.themes)) setSavedThemes(json.themes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load saved themes";
      toast({ title: "Could not load saved themes", description: msg, variant: "destructive" });
    } finally {
      setThemesLoading(false);
    }
  }, [user, toast]);

  const handleSaveTheme = async () => {
    if (!user) return;
    const nameError = validateTextField(saveName, { label: "Name", max: 200, required: true });
    if (nameError) {
      toast({ title: "Could not save theme", description: nameError, variant: "destructive" });
      return;
    }
    const name = safeText(saveName);
    setSaving(true);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, theme: customTheme }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSaveOpen(false);
      setSaveName("");
      await loadThemes();
      toast({ title: "Theme saved", description: `"${name}" saved to your account.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save theme";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTheme = async (id: string, name: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/themes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSavedThemes((themes) => themes.filter((t) => t.id !== id));
      toast({ title: "Deleted", description: `"${name}" removed.` });
    } catch {
      toast({ title: "Could not delete", variant: "destructive" });
    }
  };

  const handleRenameTheme = async (id: string) => {
    if (!user) return;
    const nameError = validateTextField(renameValue, { label: "Name", max: 200 });
    if (nameError) {
      toast({ title: "Could not rename theme", description: nameError, variant: "destructive" });
      return;
    }
    const name = safeText(renameValue);
    const theme = savedThemes.find((t) => t.id === id);
    if (!theme) return;
    if (!name || name === theme.name) {
      setRenamingId(null);
      return;
    }
    try {
      // Rename only (upsert with existing id) — preserve the saved theme data.
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, theme: theme.theme }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Rename failed");
      setSavedThemes((themes) => themes.map((t) => (t.id === id ? { ...t, ...json.theme } : t)));
      setRenamingId(null);
      toast({ title: "Renamed", description: `Theme renamed to "${name}".` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not rename theme";
      toast({ title: "Could not rename", description: msg, variant: "destructive" });
    }
  };

  const handleChange = (key: keyof CustomTheme, value: CustomThemeColor) => {
    setCustomTheme({ [key]: value } as Partial<CustomTheme>);
  };

  const handleColorChange = (key: string, c: string) => {
    handleChange(key as keyof CustomTheme, hexAlphaToColorOpacity(c, customTheme[key as keyof CustomTheme].opacity));
  };

  const getColorWithAlpha = (key: string) => {
    const theme = customTheme[key as keyof CustomTheme];
    return colorOpacityToHexAlpha(theme.color, theme.opacity);
  };

  // Position + minimize + drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    setPosition(clampPosition(
      Math.max(0, window.innerWidth - dialogWidth(window.innerWidth) - 20),
      Math.max(TOP_OFFSET, window.innerHeight / 2 - 250),
      window.innerWidth,
      window.innerHeight,
    ));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, [role='slider']")) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handlePointerMove = (e: PointerEvent) => {
      const newX = dragStartRef.current.posX + (e.clientX - dragStartRef.current.x);
      const newY = dragStartRef.current.posY + (e.clientY - dragStartRef.current.y);
      const h = dialogRef.current?.offsetHeight;
      setPosition(clampPosition(newX, newY, window.innerWidth, window.innerHeight, h));
    };
    const handlePointerUp = () => setIsDragging(false);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDragging]);

  const handleMinimize = useCallback(() => {
    // minimize = close + remember: drop open state so the toolbar button's
    // setThemeEditorOpen(true) becomes a real false->true transition later.
    setMinimized(true)
    setThemeEditorOpen(false)
  }, [])

  // Un-minimize on any genuine open transition (e.g. the toolbar button reopens).
  // Must run before the early returns below (rules-of-hooks).
  useEffect(() => {
    if (themeEditorOpen) setMinimized(false)
  }, [themeEditorOpen])

  // Minimized: small docked pill (draggable, snaps to edges). Check this BEFORE
  // the !themeEditorOpen guard so the pill survives the close.
  if (minimized) {
    return (
      <MinimizedDialogPill
        icon={<Palette className="h-3.5 w-3.5" />}
        label="Theme"
        onRestore={() => setMinimized(false)}
      />
    )
  }

  if (!themeEditorOpen) return null

  // Group presets by category
  const groupedPresets = THEME_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) acc[preset.category] = [];
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, typeof THEME_PRESETS>);

  // Minimized: small docked pill (draggable, snaps to edges)
  if (minimized) {
    return (
      <MinimizedDialogPill
        icon={<Palette className="h-3.5 w-3.5" />}
        label="Theme"
        onRestore={() => setMinimized(false)}
      />
    );
  }

  // Full dialog
  return (
    <div
      ref={dialogRef}
      className="fixed z-50 flex flex-col rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: dialogWidth(window.innerWidth), maxHeight: "85vh", touchAction: "none" }}
    >
      {/* Header - draggable */}
      <div
        className="flex items-center justify-between border-b border-border/40 px-3 py-2 cursor-grab select-none"
        onPointerDown={handlePointerDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Palette className="h-3.5 w-3.5" />
            Custom Theme
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                disabled={saving}
                title="Save this theme to your account"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2 space-y-2" align="start" sideOffset={4}>
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Save custom theme
              </Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveTheme();
                  }
                }}
                placeholder="Theme name…"
                className="h-8 text-xs"
                autoFocus
              />
              <Button size="sm" className="w-full h-8 text-xs" disabled={saving} onClick={handleSaveTheme}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save to account
              </Button>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={resetCustomTheme}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleMinimize}
            title="Minimize to dock"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setThemeEditorOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Preset Themes */}
        <div className="space-y-1.5">
          <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Preset Themes
          </Label>
          <Popover
            open={presetOpen}
            onOpenChange={(open) => {
              setPresetOpen(open);
              if (open) loadThemes();
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 text-[10px] text-foreground hover:bg-background/80 transition-colors"
              >
                <span>Select a theme preset...</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(min(360px,100vw-16px)-24px)] p-1.5 max-h-[300px] overflow-y-auto" align="start">
              {/* Saved-to-cloud themes, grouped under "Custom" */}
              <div key="custom" className="mb-1.5">
                <div className="flex items-center justify-between px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  <span>Custom</span>
                  {themesLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                </div>
                {user && savedThemes.length > 0 ? (
                  savedThemes.map((t) => (
                    <div
                      key={t.id}
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-[10px] text-left"
                    >
                      <div className="flex gap-0.5 shrink-0">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.folderIcon?.color }} />
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.fileIcon?.color }} />
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.background?.color }} />
                      </div>
                      {renamingId === t.id ? (
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameTheme(t.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          className="h-6 flex-1 min-w-0 text-xs px-1.5"
                        />
                      ) : (
                        <button
                          onClick={() => setCustomTheme(t.theme)}
                          className="flex flex-1 min-w-0 items-center gap-1 text-left"
                          title={`Apply "${t.name}"`}
                        >
                          <span className="truncate text-foreground/80">{t.name}</span>
                        </button>
                      )}
                      {renamingId === t.id ? (
                        <>
                          <button
                            onClick={() => handleRenameTheme(t.id)}
                            className="shrink-0 rounded p-0.5 text-green-500 hover:bg-foreground/10 transition-colors"
                            title="Save name"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 transition-colors"
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteTheme(t.id, t.name)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
                            title={`Delete "${t.name}"`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground/60">
                    {user ? "No saved themes yet. Use Save to store one." : "Sign in to sync custom themes to your account."}
                  </div>
                )}
              </div>
              {Object.entries(groupedPresets).map(([category, presets]) => (
                <div key={category} className="mb-1.5">
                  <div className="px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                    {category}
                  </div>
                  {presets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setCustomTheme(preset.theme)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[10px] hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex gap-0.5 shrink-0">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: preset.theme.folderIcon.color }} />
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: preset.theme.fileIcon.color }} />
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: preset.theme.background.color }} />
                      </div>
                      <span className="text-foreground/80">{preset.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        {THEME_EDITOR_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {section.title}
            </Label>
            <div className="space-y-1.5">
              {section.keys.map((meta) => (
                <div key={meta.key}>
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 cursor-pointer hover:bg-background/60 transition-colors"
                    onClick={() => setExpandedPicker(expandedPicker === meta.key ? null : meta.key)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-5 w-5 shrink-0 rounded-md border border-border"
                        style={{ background: toCssColor(customTheme[meta.key].color, customTheme[meta.key].opacity) }}
                        title={`${meta.label}: ${meta.description}`}
                      />
                      <Label
                        className="truncate text-[10px] font-medium uppercase tracking-wider text-foreground/80"
                        title={`${meta.label}: ${meta.description}`}
                      >
                        {meta.label}
                      </Label>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={customTheme[meta.key].color}
                        onChange={(e) => handleChange(meta.key, { color: e.target.value, opacity: customTheme[meta.key].opacity })}
                        className="w-20 rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[10px] text-foreground"
                      />
                    </div>
                  </div>
                  {expandedPicker === meta.key && (
                    <div className="mt-2 rounded-lg border border-border/40 bg-background/60 p-3 space-y-3">
                      <div className="rounded-lg overflow-hidden">
                        <HexAlphaColorPicker
                          color={getColorWithAlpha(meta.key)}
                          onChange={(c) => handleColorChange(meta.key, c)}
                          style={{ width: "100%", height: 160 }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <HexColorInput
                            color={customTheme[meta.key].color}
                            onChange={(c) => handleChange(meta.key, { color: c, opacity: customTheme[meta.key].opacity })}
                            prefixed
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 pl-5 font-mono text-xs text-foreground"
                          />
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">#</span>
                        </div>
                        <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums text-foreground/70">
                          {Math.round(customTheme[meta.key].opacity * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}