"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Palette, Save, X, GripVertical, Minus, Trash2, Loader2 } from "lucide-react";
import { toCssColor } from "@/lib/fewer/themeColors";
import { THEME_COLOR_META, type CustomTheme, type CustomThemeColor, type ThemeColorMeta, type SavedTheme } from "@/lib/fewer/types";
import { HexAlphaColorPicker, HexColorInput } from "react-colorful";
import { THEME_PRESETS } from "@/lib/fewer/themePresets";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const DIALOG_WIDTH = 360;
const TOP_OFFSET = 80; // navbar + toolbar

/** Dialog width clamped to viewport (mobile-safe). */
function dialogWidth() {
  return Math.min(DIALOG_WIDTH, window.innerWidth - 16);
}

function clampPosition(x: number, y: number, dialogHeight?: number) {
  const w = dialogWidth();
  const minX = 0;
  const maxX = Math.max(0, window.innerWidth - w);
  const minY = TOP_OFFSET;
  const h = dialogHeight ?? Math.min(window.innerHeight * 0.85, 600);
  const maxY = Math.max(TOP_OFFSET, window.innerHeight - h);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

type DockEdge = "top" | "bottom" | "left" | "right";

/** Snap to nearest canvas edge, keeping the perpendicular position */
function snapDockPosition(x: number, y: number): { x: number; y: number; edge: DockEdge } {
  const b = getCanvasBounds();
  const pad = 12;
  const vPillW = 26;
  const vPillH = 48;
  const hPillW = 80;
  const hPillH = 26;

  // Distance from each edge
  const distTop = y - b.top;
  const distBottom = (b.top + b.height) - y;
  const distLeft = x - b.left;
  const distRight = (b.left + b.width) - x;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);

  if (minDist === distTop) {
    // Top edge: keep x, snap y to top
    return { x: Math.max(b.left + pad, Math.min(b.left + b.width - pad - hPillW, x - hPillW / 2)), y: b.top + pad, edge: "top" };
  }
  if (minDist === distBottom) {
    return { x: Math.max(b.left + pad, Math.min(b.left + b.width - pad - hPillW, x - hPillW / 2)), y: b.top + b.height - pad - hPillH, edge: "bottom" };
  }
  if (minDist === distLeft) {
    return { x: b.left + pad, y: Math.max(b.top + pad, Math.min(b.top + b.height - pad - vPillH, y - vPillH / 2)), edge: "left" };
  }
  // Right edge
  return { x: b.left + b.width - pad - vPillW, y: Math.max(b.top + pad, Math.min(b.top + b.height - pad - vPillH, y - vPillH / 2)), edge: "right" };
}

/** Get the canvas area bounds (excludes sidebar, navbar, toolbar) */
function getCanvasBounds() {
  const main = document.getElementById("main-content");
  if (main) {
    const r = main.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return { left: 0, top: TOP_OFFSET, width: window.innerWidth, height: window.innerHeight - TOP_OFFSET };
}

/** Clamp raw dock drag position to canvas area */
function clampDockRaw(x: number, y: number) {
  const b = getCanvasBounds();
  const pillSize = 36;
  return {
    x: Math.max(b.left, Math.min(b.left + b.width - pillSize, x)),
    y: Math.max(b.top, Math.min(b.top + b.height - pillSize, y)),
  };
}

const SECTIONS: { title: string; keys: ThemeColorMeta[] }[] = [
  { title: "Canvas & Text", keys: THEME_COLOR_META.filter((m) => ["background", "defaultText", "subtleText", "itemHover", "handle", "edge"].includes(m.key)) },
  { title: "Folders", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("folder")) },
  { title: "Files", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("file")) },
];

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
    const name = saveName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give your theme a name to save it." });
      return;
    }
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

  const handleChange = (key: keyof CustomTheme, value: CustomThemeColor) => {
    setCustomTheme({ [key]: value } as Partial<CustomTheme>);
  };

  const handleColorChange = (key: string, c: string) => {
    const hex = c.startsWith("#") ? c : `#${c}`;
    if (hex.length === 9) {
      const a = parseInt(hex.slice(7, 9), 16) / 255;
      handleChange(key as keyof CustomTheme, { color: hex.slice(0, 7), opacity: Math.round(a * 100) / 100 });
    } else {
      handleChange(key as keyof CustomTheme, { color: hex.slice(0, 7), opacity: customTheme[key as keyof CustomTheme].opacity });
    }
  };

  const getColorWithAlpha = (key: string) => {
    const theme = customTheme[key as keyof CustomTheme];
    const a = Math.round(theme.opacity * 255).toString(16).padStart(2, "0");
    return `${theme.color}${a}`;
  };

  // Position + minimize + drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const dockDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [dockPosition, setDockPosition] = useState({ x: 0, y: 0 });
  const [dockEdge, setDockEdge] = useState<DockEdge>("bottom");
  const dockMovedRef = useRef(false);
  const dockPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPosition(clampPosition(
      Math.max(0, window.innerWidth - dialogWidth() - 20),
      Math.max(TOP_OFFSET, window.innerHeight / 2 - 250),
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
      setPosition(clampPosition(newX, newY, h));
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

  // Dock pill drag with snap-to-edge
  const handleDockPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dockMovedRef.current = false;
    setIsDraggingDock(true);
    dockDragStartRef.current = { x: e.clientX, y: e.clientY, posX: dockPosition.x, posY: dockPosition.y };
    e.preventDefault();
  }, [dockPosition]);

  useEffect(() => {
    if (!isDraggingDock) return;
    const handlePointerMove = (e: PointerEvent) => {
      dockMovedRef.current = true;
      const newX = dockDragStartRef.current.posX + (e.clientX - dockDragStartRef.current.x);
      const newY = dockDragStartRef.current.posY + (e.clientY - dockDragStartRef.current.y);
      const clamped = clampDockRaw(newX, newY);
      dockPosRef.current = clamped;
      setDockPosition(clamped);
    };
    const handlePointerUp = () => {
      setIsDraggingDock(false);
      if (!dockMovedRef.current) {
        setMinimized(false);
        return;
      }
      // Snap to nearest dock point using ref for latest position
      const snapped = snapDockPosition(dockPosRef.current.x, dockPosRef.current.y);
      dockPosRef.current = snapped;
      setDockPosition(snapped);
      setDockEdge(snapped.edge);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDraggingDock]);

  const handleMinimize = useCallback(() => {
    const centerX = position.x + dialogWidth() / 2;
    const centerY = position.y + 200;
    const snapped = snapDockPosition(centerX, centerY);
    dockPosRef.current = snapped;
    setDockPosition(snapped);
    setDockEdge(snapped.edge);
    setMinimized(true);
  }, [position]);

  if (!themeEditorOpen) return null;

  // Group presets by category
  const groupedPresets = THEME_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.category]) acc[preset.category] = [];
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<string, typeof THEME_PRESETS>);

  // Minimized: small docked pill (draggable, snaps to edges)
  if (minimized) {
    const isVertical = dockEdge === "left" || dockEdge === "right";

    return (
      <div
        className={`fixed z-50 flex rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-lg select-none hover:shadow-xl ${isVertical ? "flex-col items-center gap-1" : "flex-row items-center gap-2"}`}
        style={{
          left: dockPosition.x,
          top: dockPosition.y,
          padding: isVertical ? "10px 6px" : "8px 14px",
          cursor: isDraggingDock ? "grabbing" : "grab",
          touchAction: "none",
          transition: isDraggingDock ? "box-shadow 150ms ease" : "left 300ms cubic-bezier(0.34,1.56,0.64,1), top 300ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms ease",
        }}
        onPointerDown={handleDockPointerDown}
        title="Drag to snap · Click to restore"
      >
        <Palette className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className={`text-[10px] font-medium text-foreground/80 ${isVertical ? "writing-vertical" : ""}`} style={isVertical ? { writingMode: "vertical-rl", textOrientation: "mixed" } : undefined}>
          Theme
        </span>
      </div>
    );
  }

  // Full dialog
  return (
    <div
      ref={dialogRef}
      className="fixed z-50 flex flex-col rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: dialogWidth(), maxHeight: "85vh", touchAction: "none" }}
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
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[10px] text-left"
                    >
                      <button
                        onClick={() => setCustomTheme(t.theme)}
                        className="flex flex-1 min-w-0 items-center gap-2 text-left hover:bg-muted/50 rounded-md px-1 -mx-1 transition-colors"
                      >
                        <div className="flex gap-0.5 shrink-0">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.folderIcon?.color }} />
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.fileIcon?.color }} />
                          <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.theme.background?.color }} />
                        </div>
                        <span className="truncate text-foreground/80">{t.name}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTheme(t.id, t.name)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
                        title={`Delete "${t.name}"`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
        {SECTIONS.map((section) => (
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