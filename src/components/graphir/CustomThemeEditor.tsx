"use client";

import { useGraphStore } from "@/store/graphStore";
import { THEME_COLOR_META, type CustomTheme } from "@/lib/graphir/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RotateCcw, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px]"
        />
        <input
          type="color"
          value={value.startsWith("#") ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
      </div>
    </div>
  );
}

export function CustomThemeEditor() {
  const customTheme = useGraphStore((s) => s.customTheme);
  const setCustomTheme = useGraphStore((s) => s.setCustomTheme);
  const resetCustomTheme = useGraphStore((s) => s.resetCustomTheme);

  const handleChange = (key: keyof CustomTheme, value: string) => {
    setCustomTheme({ [key]: value });
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
      <div className="grid grid-cols-1 gap-2">
        {THEME_COLOR_META.map((meta) => (
          <ColorPicker
            key={meta.key}
            label={meta.label}
            value={customTheme[meta.key]}
            onChange={(v) => handleChange(meta.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
