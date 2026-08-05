"use client";

import { useGraphStore } from "@/store/graphStore";
import { THEME_COLOR_META, type CustomTheme, type CustomThemeColor, type ThemeColorMeta } from "@/lib/fewer/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCcw, Palette } from "lucide-react";
import { toCssColor } from "@/lib/fewer/themeColors";

interface ColorPickerProps {
  meta: ThemeColorMeta;
  value: CustomThemeColor;
  onChange: (value: CustomThemeColor) => void;
}

function isHexColor(v: string) {
  return /^#?([0-9a-fA-F]{6})$/.test(v.trim());
}

function ColorPicker({ meta, value, onChange }: ColorPickerProps) {
  const preview = toCssColor(value.color, value.opacity);
  const hexForInput = isHexColor(value.color) ? value.color : value.color.trim();
  return (
    <div className="space-y-1.5 rounded-lg border border-border/40 bg-background/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-4 w-4 shrink-0 rounded border border-border"
            style={{ background: preview }}
            title={`${preview}`}
          />
          <Label
            className="truncate text-[10px] font-medium uppercase tracking-wider text-foreground/80"
            title={`${meta.label} — ${meta.description}`}
          >
            {meta.label}
          </Label>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="text"
            value={hexForInput}
            onChange={(e) => onChange({ color: e.target.value, opacity: value.opacity })}
            className="w-20 rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[10px] text-foreground"
          />
          <input
            type="color"
            value={isHexColor(value.color) ? value.color : "#000000"}
            onChange={(e) => onChange({ color: e.target.value, opacity: value.opacity })}
            className="h-6 w-6 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] tabular-nums text-muted-foreground">Opacity</span>
        <Slider
          value={[value.opacity]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => onChange({ color: value.color, opacity: v })}
          className="flex-1"
        />
        <span className="w-9 text-right font-mono text-[10px] tabular-nums text-foreground/70">
          {Math.round(value.opacity * 100)}%
        </span>
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

  const handleChange = (key: keyof CustomTheme, value: CustomThemeColor) => {
    setCustomTheme({ [key]: value } as Partial<CustomTheme>);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3 w-3" />
          Custom Theme
        </Label>
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
