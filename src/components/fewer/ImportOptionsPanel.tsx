"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Filter,
  Eye,
  EyeOff,
  Package,
  FolderX,
  FileIcon,
} from "lucide-react";
import type { ImportOptions } from "@/lib/fewer/importOptions";

interface ImportOptionsPanelProps {
  options: ImportOptions;
  onChange: (partial: Partial<ImportOptions>) => void;
  advancedModeEnabled: boolean;
}

export function ImportOptionsPanel({
  options,
  onChange,
  advancedModeEnabled,
}: ImportOptionsPanelProps) {
  const update = (partial: Partial<ImportOptions>) => onChange(partial);

  // Extensions are edited as raw text; binding the input directly to the
  // parsed array eats commas/spaces while typing. Commit on blur/Enter.
  const [extText, setExtText] = useState(() => options.extensions.join(", "));
  // External change (e.g. dialog reset) — sync unless it matches what's typed.
  useEffect(() => {
    setExtText((current) => {
      const parsed = current
        .split(",")
        .map((s) => s.trim().replace(/^\./, ""))
        .filter(Boolean);
      const same =
        parsed.length === options.extensions.length &&
        parsed.every((p, i) => p === options.extensions[i]);
      return same ? current : options.extensions.join(", ");
    });
  }, [options.extensions]);

  const commitExtensions = () => {
    const exts = extText
      .split(",")
      .map((s) => s.trim().replace(/^\./, ""))
      .filter(Boolean);
    update({ extensions: exts });
    setExtText(exts.join(", "));
  };

  return (
    <div className="space-y-4">
      {/* Max Depth */}
      <div className="space-y-3 rounded-xl border border-border/40 bg-muted/25 p-4 transition-colors">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            Max Scan Depth
          </Label>
          <span className="text-xs font-mono font-medium text-foreground/80">
            {options.maxDepth === 0 ? "Unlimited" : `${options.maxDepth} levels`}
          </span>
        </div>
        <Slider
          value={[options.maxDepth]}
          onValueChange={([v]) => update({ maxDepth: v })}
          min={0}
          max={10}
          step={1}
        />
        <p className="text-xs text-muted-foreground leading-normal">
          How deep to scan. 0 = no limit.
        </p>
      </div>

      {/* Display Depth */}
      <div className="space-y-3 rounded-xl border border-border/40 bg-muted/25 p-4 transition-colors">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            Max Display Depth
          </Label>
          <span className="text-xs font-mono font-medium text-foreground/80">
            {options.displayMaxDepth === 0 ? "Unlimited" : `${options.displayMaxDepth} levels`}
          </span>
        </div>
        <Slider
          value={[options.displayMaxDepth]}
          onValueChange={([v]) => update({ displayMaxDepth: v })}
          min={1}
          max={10}
          step={1}
        />
        <p className="text-xs text-muted-foreground leading-normal">
          How deep to display after import. Deeper nodes go to Hidden Nodes.
        </p>
      </div>

      {/* Advanced Options */}
      {advancedModeEnabled && (
        <>
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85 block">
            Advanced Options
          </Label>

          <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
            <div className="flex items-center gap-3">
              {options.includeHidden ? (
                <Eye className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              )}
              <div className="space-y-0.5">
                <Label htmlFor="ip-include-hidden" className="text-xs font-medium cursor-pointer">
                  Include Hidden Files
                </Label>
                <p className="text-xs text-muted-foreground">
                  Include hidden files (<code className="font-mono text-[10px] bg-muted px-1 rounded">.gitignore</code>, <code className="font-mono text-[10px] bg-muted px-1 rounded">.env</code>, etc.)
                </p>
              </div>
            </div>
            <Switch
              id="ip-include-hidden"
              checked={options.includeHidden}
              onCheckedChange={(v) => update({ includeHidden: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
            <div className="flex items-center gap-3">
              <Package className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              <div className="space-y-0.5">
                <Label htmlFor="ip-include-vendored" className="text-xs font-medium cursor-pointer">
                  Include node_modules
                </Label>
                <p className="text-xs text-muted-foreground">
                  Scan <code className="font-mono text-[10px] bg-muted px-1 rounded">node_modules</code> and dependency folders.
                </p>
              </div>
            </div>
            <Switch
              id="ip-include-vendored"
              checked={options.includeVendored}
              onCheckedChange={(v) => update({ includeVendored: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
            <div className="flex items-center gap-3">
              <FolderX className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              <div className="space-y-0.5">
                <Label htmlFor="ip-skip-empty" className="text-xs font-medium cursor-pointer">
                  Skip Empty Folders
                </Label>
                <p className="text-xs text-muted-foreground">
                  Hide folders with no files inside.
                </p>
              </div>
            </div>
            <Switch
              id="ip-skip-empty"
              checked={options.skipEmptyFolders}
              onCheckedChange={(v) => update({ skipEmptyFolders: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
            <div className="flex items-center gap-3">
              <FileIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
              <div className="space-y-0.5">
                <Label htmlFor="ip-show-files" className="text-xs font-medium cursor-pointer">
                  Show Files on Canvas
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show file nodes. Off = directories only.
                </p>
              </div>
            </div>
            <Switch
              id="ip-show-files"
              checked={options.includeFiles}
              onCheckedChange={(v) => update({ includeFiles: v })}
            />
          </div>

          <div className="space-y-2.5 rounded-xl border border-border/40 p-4 bg-card/10">
            <Label className="text-xs font-medium text-muted-foreground">File Extensions</Label>
            <p className="text-xs text-muted-foreground">
              Only scan these extensions. Comma-separated.
            </p>
            <Input
              value={extText}
              onChange={(e) => setExtText(e.target.value)}
              onBlur={commitExtensions}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitExtensions();
                }
              }}
              placeholder="e.g. ts, tsx, js, json"
              className="font-mono text-xs h-9 bg-muted/20 border-border/50 focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-2.5 pt-1">
              <Switch
                checked={options.caseSensitiveExtensions}
                onCheckedChange={(v) => update({ caseSensitiveExtensions: v })}
                id="ip-case-sensitive"
              />
              <Label
                htmlFor="ip-case-sensitive"
                className="text-xs text-muted-foreground cursor-pointer font-medium"
              >
                Case-Sensitive Match
              </Label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}