"use client";

import { useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { THEME_COLOR_META, type CustomTheme, type CustomThemeColor, type ThemeColorMeta } from "@/lib/fewer/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RotateCcw, Palette, Save, Loader2 } from "lucide-react";
import { toCssColor } from "@/lib/fewer/themeColors";
import { HexAlphaColorPicker, HexColorInput } from "react-colorful";
import { safeText, validateTextField } from "@/lib/fewer/textValidation";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ColorPickerProps {
  meta: ThemeColorMeta;
  value: CustomThemeColor;
  onChange: (value: CustomThemeColor) => void;
}

function ColorPicker({ meta, value, onChange }: ColorPickerProps) {
  const preview = toCssColor(value.color, value.opacity);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-5 w-5 shrink-0 rounded-md border border-border cursor-pointer transition-transform hover:scale-110"
              style={{ background: preview }}
              title={`${meta.label}: ${meta.description}`}
            />
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-3 space-y-3" align="start" sideOffset={4}>
            <div className="rounded-lg overflow-hidden">
              <HexAlphaColorPicker
                color={value.color}
                onChange={(c) => {
                  const hex = c.startsWith("#") ? c : `#${c}`;
                  if (hex.length === 9) {
                    const a = parseInt(hex.slice(7, 9), 16) / 255;
                    onChange({ color: hex.slice(0, 7), opacity: Math.round(a * 100) / 100 });
                  } else {
                    onChange({ color: hex.slice(0, 7), opacity: value.opacity });
                  }
                }}
                style={{ width: "100%", height: 160 }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <HexColorInput
                  color={value.color}
                  onChange={(c) => onChange({ color: c, opacity: value.opacity })}
                  prefixed
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 pl-5 font-mono text-xs text-foreground"
                />
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">#</span>
              </div>
              <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums text-foreground/70">
                {Math.round(value.opacity * 100)}%
              </span>
            </div>
          </PopoverContent>
        </Popover>
        <Label
          className="truncate text-[10px] font-medium uppercase tracking-wider text-foreground/80"
          title={`${meta.label}: ${meta.description}`}
        >
          {meta.label}
        </Label>
      </div>
    </div>
  );
}

const SECTIONS: { title: string; keys: ThemeColorMeta[] }[] = [
  { title: "Canvas & Text", keys: THEME_COLOR_META.filter((m) => ["background", "defaultText", "subtleText", "itemHover", "handle", "edge"].includes(m.key)) },
  { title: "Folders", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("folder")) },
  { title: "Files", keys: THEME_COLOR_META.filter((m) => m.key.startsWith("file")) },
];

export function CustomThemeEditor() {
  const customTheme = useGraphStore((s) => s.customTheme);
  const setCustomTheme = useGraphStore((s) => s.setCustomTheme);
  const resetCustomTheme = useGraphStore((s) => s.resetCustomTheme);
  const { user } = useAuth();
  const { toast } = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (key: keyof CustomTheme, value: CustomThemeColor) => {
    setCustomTheme({ [key]: value } as Partial<CustomTheme>);
  };

  const handleSave = async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to save themes to your account." });
      return;
    }
    const nameError = validateTextField(saveName, { label: "Name", max: 200, required: true });
    if (nameError) {
      toast({ title: "Name required", description: nameError, variant: "destructive" });
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
      toast({ title: "Theme saved", description: `"${name}" saved to your account.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save theme";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3 w-3" />
          Custom Theme
        </Label>
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
                    handleSave();
                  }
                }}
                placeholder="Theme name…"
                className="h-8 text-xs"
                autoFocus
              />
              <Button size="sm" className="w-full h-8 text-xs" disabled={saving} onClick={handleSave}>
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
            Reset
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {section.title}
            </Label>
            <div className="space-y-2">
              {section.keys.map((meta) => (
                <ColorPicker
                  key={meta.key}
                  meta={meta}
                  value={customTheme[meta.key]}
                  onChange={(v) => handleChange(meta.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}