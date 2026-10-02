"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { EditableNumber } from "@/components/ui/editable-number";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Filter,
  Eye,
  EyeOff,
  FileArchive,
  Package,
  FolderX,
  FileIcon,
  Link2,
} from "lucide-react";
import { RELEVANT_OPTIONS, type ImportOptions, type OptionKey, type OptionScope } from "@/lib/fewer/importOptions";
import { cn } from "@/lib/utils";

interface ImportOptionsPanelProps {
  options: ImportOptions;
  onChange: (partial: Partial<ImportOptions>) => void;
  advancedFormats: boolean;
  /** The source's option scope — decides which controls can exist on screen. */
  scope: OptionScope;
}

export function ImportOptionsPanel({
  options,
  onChange,
  advancedFormats,
  scope,
}: ImportOptionsPanelProps) {
  const update = (partial: Partial<ImportOptions>) => onChange(partial);

  // Per-origin scoping: show exactly the controls whose option can act on this
  // scope, and nothing else. The dispatcher scopes the values through the same
  // map (scopeOptionsToOrigin), so what is on screen is what applies — one
  // source of truth in RELEVANT_OPTIONS, so the UI and the behavior cannot
  // drift.
  const relevant = new Set(RELEVANT_OPTIONS[scope]);
  const show = (key: OptionKey) => relevant.has(key);

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
      {/* Max Scan Depth — a scan concept: only where Fewer enumerates a
          filesystem. A pasted file has no scan step, so this control has
          nothing to do and must not be shown. */}
      {show("maxDepth") && (
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/25 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              Max Scan Depth
            </Label>
            <span className="text-xs font-mono font-medium text-foreground/80">
              <EditableNumber value={options.maxDepth} onCommit={(v) => update({ maxDepth: v })} labelFn={(v) => (v === 0 ? "Unlimited" : `${v} levels`)} />
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
      )}

      {/* Display Depth */}
      <div className="space-y-3 rounded-xl border border-border/40 bg-muted/25 p-4 transition-colors">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            Max Display Depth
          </Label>
          <span className="text-xs font-mono font-medium text-foreground/80">
            <EditableNumber value={options.displayMaxDepth} onCommit={(v) => update({ displayMaxDepth: v })} labelFn={(v) => (v === 0 ? "Unlimited" : `${v} levels`)} />
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
          How deep to display after import. Deeper cards go to Hidden Cards.
        </p>
      </div>

      {/* Show Files on Canvas — display-layer, so it is never behind the
          advanced gate: it applies to every origin that can import files. */}
      {show("includeFiles") && (
        <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
          <div className="flex items-center gap-3">
            <FileIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
            <div className="space-y-0.5">
              <Label htmlFor="ip-show-files" className="text-xs font-medium cursor-pointer">
                Show Files on Canvas
              </Label>
              <p className="text-xs text-muted-foreground">
                Show file cards. Off = directories only.
              </p>
            </div>
          </div>
          <Switch
            id="ip-show-files"
            checked={options.includeFiles}
            onCheckedChange={(v) => update({ includeFiles: v })}
          />
        </div>
      )}

      {/* Advanced Options */}
      {advancedFormats && (
        <>
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85 block">
            Advanced Options
          </Label>

          {show("includeHidden") && (
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
          )}

          {show("includeVendored") && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="ip-include-vendored" className="text-xs font-medium cursor-pointer">
                    Include dependency &amp; build folders
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {scope === "file:text" ? (
                      <>
                        Drop <code className="font-mono text-[10px] bg-muted px-1 rounded">node_modules</code>,{" "}
                        <code className="font-mono text-[10px] bg-muted px-1 rounded">dist</code>,{" "}
                        <code className="font-mono text-[10px] bg-muted px-1 rounded">.git</code>, and other generated
                        folders found in the file. Everything else imports exactly as given.
                      </>
                    ) : (
                      <>
                        Scan <code className="font-mono text-[10px] bg-muted px-1 rounded">node_modules</code>,{" "}
                        <code className="font-mono text-[10px] bg-muted px-1 rounded">dist</code>,{" "}
                        <code className="font-mono text-[10px] bg-muted px-1 rounded">.git</code>, and other{" "}
                        generated folders.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Switch
                id="ip-include-vendored"
                checked={options.includeVendored}
                onCheckedChange={(v) => update({ includeVendored: v })}
              />
            </div>
          )}

          {/* Symlinks: consumed only by the server-side local-path walk — a
              browser folder pick can't detect links, and neither can the
              archive/url/cloud readers. Folder import only. */}
          {show("symlinks") && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Link2 className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Symlinks</Label>
                  <p className="text-xs text-muted-foreground">
                    Local-path imports only — browser folder picks can&apos;t detect links.
                  </p>
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label="Symlink handling"
                className="flex shrink-0 overflow-hidden rounded-lg border border-border/50"
              >
                {(
                  [
                    ["skip", "Skip"],
                    ["leaf", "Show as links"],
                    ["follow", "Follow"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={options.symlinks === mode}
                    onClick={() => update({ symlinks: mode })}
                    className={cn(
                      "px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                      options.symlinks === mode
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-foreground/10",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {show("skipEmptyFolders") && (
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
          )}

          {show("expandArchives") && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
              <div className="flex items-center gap-3">
                <FileArchive className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="ip-expand-archives" className="text-xs font-medium cursor-pointer">
                    Look Inside Archives
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show what&apos;s inside{" "}
                    <code className="font-mono text-[10px] bg-muted px-1 rounded">.zip</code>,{" "}
                    <code className="font-mono text-[10px] bg-muted px-1 rounded">.tar</code>,{" "}
                    <code className="font-mono text-[10px] bg-muted px-1 rounded">.7z</code>{" "}
                    and friends found in the folder, without extracting them.
                  </p>
                </div>
              </div>
              <Switch
                id="ip-expand-archives"
                checked={options.expandArchives}
                onCheckedChange={(v) => update({ expandArchives: v })}
              />
            </div>
          )}

          {show("extensions") && (
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
          )}
        </>
      )}
    </div>
  );
}