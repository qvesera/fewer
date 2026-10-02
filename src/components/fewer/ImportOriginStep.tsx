"use client";

/**
 * Step 1 of the unified 3-step import flow: select origin + pick source.
 * This is the ONLY place origin-specific configuration UI lives.
 * Step 2 (shared ImportOptionsPanel) and step 3 (per-origin action) are
 * handled by ImportFlowDialog.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BellRing,
  ChevronRight,
  Cloud,
  Columns3,
  ExternalLink,
  FileArchive,
  FileIcon,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderTree,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  ScanLine,
  Settings as SettingsIcon,
  Upload,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFileSystemAccessSupported } from "@/lib/fewer/fileSystem";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";
import {
  CSV_FIELD_LABELS,
  CSV_MAPPING_FIELDS,
  guessCsvMapping,
  isExportCsv,
  parseCsvRows,
} from "@/lib/fewer/csvModel";
import type { CsvMappingField } from "@/lib/fewer/csvModel";
import {
  listCloudFolder,
  PROVIDER_LABELS,
  useConnections,
} from "@/hooks/use-cloud";
import type { CloudConnection, CloudEntry } from "@/lib/fewer/cloud/types";
import {
  ARCHIVE_EXTENSIONS,
  ORIGIN_META,
  defaultFileSource,
  defaultSourceFor,
  isArchiveFileName,
  isGitHubUrl,
  resolveFileFormat,
} from "@/lib/fewer/importFlow";
import type {
  FileImportFormat,
  ImportOrigin,
  OriginSource,
  TextFileSource,
} from "@/lib/fewer/importFlow";

export interface ImportOriginStepProps {
  origin: ImportOrigin;
  onOriginChange: (origin: ImportOrigin) => void;
  source: OriginSource;
  onSourceChange: (source: OriginSource) => void;
  cloudImport: boolean;
  onRequireAuth: () => void;
  onOpenCloudSettings: () => void;
  /** Advance to the next step (folder origin has no picky source → Enter advances). */
  onAdvance: () => void;
}

const ORIGINS: ImportOrigin[] = ["folder", "file", "url", "cloud"];

// URL and cloud origins require a linked account — only available to
// signed-in users. Signed-out users see the local-only origins: folder and
// file. Archive rides along inside the file origin, so it needs no card.
const VISIBLE_ORIGINS_FOR: Record<"linkable" | "basic", ImportOrigin[]> = {
  linkable: ORIGINS,
  basic: ORIGINS.filter((o) => o === "folder" || o === "file"),
};

/**
 * Origin → card icon, shared with the step-3 summary header in
 * ImportFlowDialog so the two can never disagree.
 */
export const ORIGIN_ICONS: Record<ImportOrigin, LucideIcon> = {
  folder: FolderOpen,
  file: Upload,
  url: Globe,
  cloud: Cloud,
};

export function ImportOriginStep({
  origin,
  onOriginChange,
  source,
  onSourceChange,
  cloudImport,
  onRequireAuth,
  onOpenCloudSettings,
  onAdvance,
}: ImportOriginStepProps) {
  const visibleOrigins = cloudImport ? VISIBLE_ORIGINS_FOR.linkable : VISIBLE_ORIGINS_FOR.basic;
  const gridRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);

  // Roving-tabindex arrow-key navigation across the origin cards (2-col grid,
  // wraps on all edges). Selecting also focuses the target so focus follows
  // the chosen source.
  const focusOrigin = useCallback((index: number) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-origin-index="${index}"]`,
    );
    el?.focus();
  }, []);

  // Focus the first interactive control of the currently active source picker:
  // format tile (file), URL input, or first linked account (cloud).
  const focusFirstInteractive = useCallback(() => {
    const el = sourceRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled])',
    );
    el?.focus();
  }, []);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Let inputs/textareas keep their own Enter/arrows.
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      // Enter: folder advances, other origins focus their source picker.
      if (e.key === "Enter") {
        e.preventDefault();
        if (origin === "folder") onAdvance();
        else focusFirstInteractive();
        return;
      }
      const selected = visibleOrigins.indexOf(origin);
      if (selected < 0) return;
      const n = visibleOrigins.length;
      const cols = 2;
      let next = -1;
      switch (e.key) {
        case "ArrowRight": next = (selected + 1) % n; break;
        case "ArrowLeft": next = (selected - 1 + n) % n; break;
        case "ArrowDown": next = (selected + cols) % n; break;
        case "ArrowUp": next = (selected - cols + n) % n; break;
        default: return;
      }
      e.preventDefault();
      const chosen = visibleOrigins[next];
      onOriginChange(chosen);
      onSourceChange(defaultSourceFor(chosen));
      focusOrigin(next);
    },
    [
      visibleOrigins,
      origin,
      onOriginChange,
      onSourceChange,
      focusOrigin,
      focusFirstInteractive,
      onAdvance,
    ],
  );

  // The three steps stay mounted (hidden via CSS), so focus the selected
  // origin once when the dialog opens to enable instant arrow-key switching.
  useEffect(() => {
    const idx = visibleOrigins.indexOf(origin);
    if (idx >= 0) focusOrigin(idx);
    // Run once on mount only.
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Origin selection ── */}
      <div role="radiogroup" aria-label="Import source"
        className="grid grid-cols-2 gap-2" ref={gridRef} onKeyDown={handleGridKeyDown}>
        {(cloudImport ? VISIBLE_ORIGINS_FOR.linkable : VISIBLE_ORIGINS_FOR.basic).map((o, idx) => {
          const Icon = ORIGIN_ICONS[o];
          const active = o === origin;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={active}
              data-origin-index={idx}
              onClick={() => {
                if (!active) {
                  onOriginChange(o);
                  onSourceChange(defaultSourceFor(o));
                }
              }}
              tabIndex={active ? 0 : -1}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border/60 hover:border-border hover:bg-muted/30",
              )}
            >
              <Icon
                className={cn(
                  "h-4.5 w-4.5",
                  active ? "text-primary" : "text-muted-foreground/80",
                )}
              />
              <span
                className={cn(
                  "text-xs font-bold",
                  active ? "text-primary" : "text-foreground",
                )}
              >
                {ORIGIN_META[o].label}
              </span>
              <span className="text-[10px] leading-snug text-muted-foreground">
                {ORIGIN_META[o].blurb}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        Tip: use <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> to switch source,{" "}
        <kbd>Tab</kbd> to continue.
      </p>

      {/* ── Origin-specific source picking ── */}
      {cloudImport || origin === "folder" || origin === "file" ? (
        <div ref={sourceRef} className="space-y-4">
          {origin === "folder" && <FolderSource />}
          {origin === "file" && (
            <FileSource
              source={source as Extract<OriginSource, { origin: "file" }>}
              onSourceChange={onSourceChange}
            />
          )}
          {origin === "url" && (
            <UrlSource
              source={source as Extract<OriginSource, { origin: "url" }>}
              onSourceChange={onSourceChange}
              cloudImport={cloudImport}
              onRequireAuth={onRequireAuth}
            />
          )}
          {origin === "cloud" && (
            <CloudSource
              source={source as Extract<OriginSource, { origin: "cloud" }>}
              onSourceChange={onSourceChange}
              cloudImport={cloudImport}
              onRequireAuth={onRequireAuth}
              onOpenCloudSettings={onOpenCloudSettings}
            />
          )}
        </div>
      ) : (
        // Signed-out user holding a stale url/cloud origin (e.g. signed out
        // mid-flow) — fall back to the folder source; url/cloud are hidden.
        <FolderSource />
      )}
    </div>
  );
}

/* ────────────────────────── Folder ────────────────────────── */

function FolderSource() {
  // Resolve client-side only to avoid SSR hydration mismatch.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(LOCAL_FS_FEATURES.fsaDirectoryPicker && isFileSystemAccessSupported());
  }, []);

  if (!supported) {
    // pickDirectoryTree falls back to <input webkitdirectory> — still works,
    // just with the legacy picker.
    return (
      <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
        <FolderOpen className="mb-1.5 h-4 w-4 text-muted-foreground/80" />
        Your device's folder picker opens when you press{" "}
        <span className="font-medium text-foreground">Browse</span>. This
        browser uses the legacy picker — everything still stays local.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
      <FolderOpen className="mb-1.5 h-4 w-4 text-muted-foreground/80" />
      Your device's folder picker opens when you press{" "}
      <span className="font-medium text-foreground">Browse</span>. Everything
      is processed in browser — nothing is uploaded.
    </div>
  );
}

/* ────────────────────────── File ────────────────────────── */

const FILE_FORMATS: {
  value: FileImportFormat;
  label: string;
  icon: LucideIcon;
  accept: string;
}[] = [
  { value: "tree", label: "ASCII Tree", icon: FolderTree, accept: ".txt" },
  { value: "json", label: "JSON Graph", icon: FileJson, accept: ".json" },
  { value: "script", label: "Shell Script", icon: FileTerminal, accept: ".sh,.bat" },
  { value: "csv", label: "CSV", icon: FileSpreadsheet, accept: ".csv" },
  { value: "dot", label: "DOT", icon: FileText, accept: ".dot,.gv" },
];

/**
 * One picker, everything it can read: every text format's extension plus the
 * archive set. Unconditional on purpose — archive import is not tier-gated, so
 * nothing in this panel may narrow what the picker offers.
 */
const FILE_ACCEPT = Array.from(
  new Set([
    ...FILE_FORMATS.flatMap((f) => f.accept.split(",")),
    ...ARCHIVE_EXTENSIONS.map((e) => `.${e}`),
  ]),
).join(",");

/**
 * One box, five shapes — the panel no longer asks which, it detects. The
 * example shown is an ASCII tree, the most common paste; the rest are named.
 */
const PASTE_PLACEHOLDER = `Paste a Fewer export, an ASCII tree, a mkdir script, a CSV table, or a Graphviz DOT graph — the format is detected for you.

root/
├── src/
│   └── App.tsx
└── package.json`;

/**
 * The file origin's panel, in one of two modes:
 *
 *  - **text** — upload + a paste box that detects its format + CSV column mapper.
 *  - **archive** — the chosen archive and its size; nothing else to configure.
 *
 * The mode is chosen by the picked file's extension (`isArchiveFileName`).
 * ponytail: the extension is a UI hint only — `listArchive` sniffs magic
 * bytes, so a renamed archive still imports once the user switches mode. The
 * upgrade path is sniffing the first bytes at pick time if that ever matters.
 *
 * The text format is DETECTED, not chosen: `resolveFileFormat` folds detection
 * and the user's override into the two fields the parser reads. The tiles
 * exist only as that override, revealed by "Change" — detection stays the
 * default because the panel's old promise ("this tile says tree") was a
 * promise the parser never checked: pasting JSON while the ASCII-Tree tile was
 * active parsed it as a tree.
 */
function FileSource({
  source,
  onSourceChange,
}: {
  source: Extract<OriginSource, { origin: "file" }>;
  onSourceChange: (source: OriginSource) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formatsRef = useRef<HTMLDivElement>(null);
  const isArchive = source.kind === "archive";
  // Narrow to the text payload so every field access below is safe.
  const text = source.kind === "text" ? source : null;
  // Local UI state only — the chosen override lives in `source.formatOverride`.
  const [showOverride, setShowOverride] = useState(false);
  // The override tiles: Auto (back to detection) first, then every format.
  const overrideOptions: { value: FileImportFormat | null; label: string; icon: LucideIcon }[] = [
    { value: null, label: "Auto", icon: Wand2 },
    ...FILE_FORMATS.map(({ value, label, icon }) => ({ value, label, icon })),
  ];
  /** Which tile is active: the override, else the detected format. */
  const activeOption = text ? (text.formatOverride ?? text.format) : null;

  /**
   * Apply an override (null = back to detection). Resolves against the current
   * content in one call, so `format` and `formatOverride` cannot drift.
   */
  const chooseOverride = useCallback(
    (value: FileImportFormat | null) => {
      if (!text) return;
      onSourceChange({ ...text, ...resolveFileFormat(text.content, value) });
    },
    [text, onSourceChange],
  );

  // Arrow-key navigation across the override tiles (a row; wraps at the ends).
  const handleFormatsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!text) return;
      const idx = overrideOptions.findIndex((f) => f.value === activeOption);
      if (idx < 0) return;
      let next = -1;
      if (e.key === "ArrowRight") next = (idx + 1) % overrideOptions.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + overrideOptions.length) % overrideOptions.length;
      else return;
      e.preventDefault();
      chooseOverride(overrideOptions[next]!.value);
      formatsRef.current
        ?.querySelector<HTMLButtonElement>(`[data-format-idx="${next}"]`)
        ?.focus();
    },
    [text, activeOption, overrideOptions, chooseOverride],
  );

  const pickFile = () => fileInputRef.current?.click();
  const clearArchive = () => onSourceChange(defaultFileSource("text"));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file.
    e.target.value = "";
    if (!file) return;

    // Archives are binary: route straight to the archive reader, no decode step.
    if (isArchiveFileName(file.name)) {
      onSourceChange({ origin: "file", kind: "archive", file, name: file.name });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) ?? "";
      // A picked file is a NEW file, so the format is detected from its content
      // and any override from the previous one no longer applies. The extension
      // decides nothing here: detection is the same rule the paste box uses, so
      // an uploaded .txt containing JSON imports as JSON.
      //
      // Drop any column mapping from the previous file: it belongs to those headers.
      onSourceChange({
        origin: "file",
        kind: "text",
        content,
        csvMapping: undefined,
        ...resolveFileFormat(content, null),
      });
    };
    reader.onerror = () =>
      onSourceChange({
        origin: "file",
        kind: "text",
        content: "",
        ...resolveFileFormat("", null),
      });
    reader.readAsText(file);
  };

  if (isArchive) {
    return (
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-full gap-2 border-border/80 text-xs font-medium text-foreground hover:bg-muted/40"
          onClick={pickFile}
        >
          <FileArchive className="h-4 w-4 text-muted-foreground" />
          Choose a different file
        </Button>

        <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
          <FileArchive className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
            {source.name}
          </p>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatBytes(source.file?.size ?? 0)}
          </span>
          <button
            type="button"
            onClick={clearArchive}
            className="shrink-0 cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Reads the archive&apos;s file listing and draws it as a graph — the archive
          is never unpacked on disk, and your files never leave the browser.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {/* The detected format is the product, not the choice: say what will
            happen, and offer "Change" only so the user can disagree with it. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ScanLine
              className={cn(
                "h-4 w-4 shrink-0",
                text?.formatOverride ? "text-primary" : "text-muted-foreground/80",
              )}
              aria-hidden="true"
            />
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {text?.formatOverride ? "Format" : "Detected"}
            </Label>
            <span className="truncate text-xs font-medium text-foreground/85">
              {FILE_FORMATS.find((f) => f.value === text?.format)?.label ?? "—"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowOverride((v) => !v)}
            aria-expanded={showOverride}
            className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showOverride ? "Done" : "Change"}
          </button>
        </div>

        {showOverride && (
          <div
            ref={formatsRef}
            onKeyDown={handleFormatsKeyDown}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {overrideOptions.map((f, i) => {
              const Icon = f.icon;
              const active = f.value === activeOption;
              return (
                <button
                  key={f.value ?? "auto"}
                  type="button"
                  data-format-idx={i}
                  onClick={() => chooseOverride(f.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-3 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 opacity-85" />
                  <span className="text-center text-xs font-medium leading-tight">
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        className="h-10 w-full gap-2 border-border/80 text-xs font-medium text-foreground hover:bg-muted/40"
        onClick={pickFile}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        Upload file
      </Button>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Or paste content below
        </Label>
        <Textarea
          value={text?.content ?? ""}
          onChange={(e) => {
            if (!text) return;
            // Editing keeps the user's override — a tweak to a CSV cell must not
            // flip them back to tree — and drops any column mapping, since a
            // mapping belongs to the headers it was guessed from.
            const content = e.target.value;
            onSourceChange({
              ...text,
              content,
              csvMapping: undefined,
              ...resolveFileFormat(content, text.formatOverride),
            });
          }}
          placeholder={PASTE_PLACEHOLDER}
          className="gm-scroll min-h-[140px] max-h-[240px] bg-muted/20 p-3.5 font-mono text-xs font-medium leading-relaxed text-foreground"
        />
      </div>

      {text?.format === "csv" && text.content.trim() !== "" && (
        <CsvColumnMapper source={text} onSourceChange={onSourceChange} />
      )}
    </div>
  );
}

/**
 * Column mapping for a CSV that isn't our own export. Shows only when the
 * header row doesn't match the export shape; pre-fills the guess from the
 * header names, and lets any field be re-pointed or cleared. The Name column
 * is required — the others are optional enhancements to the hierarchy.
 */
function CsvColumnMapper({
  source,
  onSourceChange,
}: {
  source: TextFileSource;
  onSourceChange: (source: OriginSource) => void;
}) {
  const headers = useMemo(() => parseCsvRows(source.content)[0] ?? [], [source.content]);
  const isExport = isExportCsv(headers);
  const mapping = source.csvMapping ?? guessCsvMapping(headers);
  const sample = useMemo(() => parseCsvRows(source.content).slice(1, 4), [source.content]);

  if (isExport) return null;

  const set = (field: CsvMappingField, index: number) => {
    onSourceChange({ ...source, csvMapping: { ...mapping, [field]: index } });
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3.5">
      <div className="flex items-center gap-2">
        <Columns3 className="h-4 w-4 text-muted-foreground/80" />
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          Columns
        </Label>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        This CSV isn't a Fewer export — tell us which column holds which. Pick the
        Name column to continue; the rest refine folders and links.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CSV_MAPPING_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label
              htmlFor={`csv-map-${field}`}
              className={cn(
                "text-[11px] font-medium",
                field === "name" && "text-primary",
              )}
            >
              {CSV_FIELD_LABELS[field]}
              {field === "name" ? " *" : ""}
            </Label>
            <Select
              value={String(mapping[field])}
              onValueChange={(v) => set(field, Number(v))}
            >
              <SelectTrigger id={`csv-map-${field}`} size="sm" className="w-full">
                <SelectValue placeholder="Column…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">— none —</SelectItem>
                {headers.map((h, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {h || `Column ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {sample.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40 gm-scroll">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-2 py-1.5 text-left font-semibold whitespace-nowrap text-muted-foreground",
                      i === mapping.name && "text-primary",
                    )}
                  >
                    {h || `Column ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((row, r) => (
                <tr key={r} className="border-b border-border/20 last:border-0">
                  {headers.map((_, c) => (
                    <td
                      key={c}
                      className={cn(
                        "max-w-[160px] truncate px-2 py-1 whitespace-nowrap text-foreground/80",
                        c === mapping.name && "font-semibold text-foreground",
                      )}
                      title={row[c] ?? ""}
                    >
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── URL ────────────────────────── */

function UrlSource({
  source,
  onSourceChange,
  cloudImport,
  onRequireAuth,
}: {
  source: Extract<OriginSource, { origin: "url" }>;
  onSourceChange: (source: OriginSource) => void;
  cloudImport: boolean;
  onRequireAuth: () => void;
}) {
  const trimmed = source.url.trim();
  const showWatch = trimmed !== "" && !isGitHubUrl(trimmed);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          <Globe className="h-3.5 w-3.5" />
          URL
        </Label>
        <Input
          value={source.url}
          onChange={(e) => {
            const url = e.target.value;
            // Reconcile the watch flag with the (hidden-for-GitHub) toggle so
            // editing a watched crawl URL to github.com never keeps it true.
            onSourceChange({
              ...source,
              url,
              watch: isGitHubUrl(url) ? false : source.watch,
            });
          }}
          placeholder="https://github.com/owner/repo or https://example.com/data/"
          className="bg-muted/20 font-mono text-xs"
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          Supports:{" "}
          <code className="rounded bg-muted/50 px-1 font-mono text-[10px]">
            https://github.com/owner/repo
          </code>{" "}
          or{" "}
          <code className="rounded bg-muted/50 px-1 font-mono text-[10px]">
            https://github.com/owner/repo/tree/branch/path
          </code>{" "}
          or any public file index URL
        </p>
      </div>

      {showWatch && (
        <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/10 p-3">
          <div className="flex items-center gap-2.5">
            <BellRing className="h-4 w-4 text-primary/80" />
            <div>
              <p className="text-xs font-medium text-foreground">
                Watch for changes
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                {cloudImport
                  ? "Daily digest (23:59) when this index changes."
                  : "Sign in to get daily change digests."}
              </p>
            </div>
          </div>
          {cloudImport ? (
            <Switch
              checked={source.watch}
              onCheckedChange={(v) => onSourceChange({ ...source, watch: v })}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 cursor-pointer gap-1 text-[11px]"
              onClick={onRequireAuth}
            >
              <Lock className="h-3 w-3" />
              Sign in
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Cloud ────────────────────────── */

function CloudSource({
  source,
  onSourceChange,
  cloudImport,
  onRequireAuth,
  onOpenCloudSettings,
}: {
  source: Extract<OriginSource, { origin: "cloud" }>;
  onSourceChange: (source: OriginSource) => void;
  cloudImport: boolean;
  onRequireAuth: () => void;
  onOpenCloudSettings: () => void;
}) {
  const {
    connections,
    loading: connLoading,
    error: connError,
    refresh,
  } = useConnections();
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [crumbs, setCrumbs] = useState<{ ref?: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const accountsRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation across the linked-account list (a vertical list).
  const handleAccountsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items =
        accountsRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-account-idx]",
        ) ?? [];
      if (items.length === 0) return;
      let idx = -1;
      for (let i = 0; i < items.length; i++) {
        if (document.activeElement === items[i]) {
          idx = i;
          break;
        }
      }
      const base = idx === -1 ? 0 : idx;
      let next = -1;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (base + 1) % items.length;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (base - 1 + items.length) % items.length;
      else return;
      e.preventDefault();
      items[next]?.focus();
    },
    [],
  );

  // The auth dialog stacks on top without closing the import flow — when the
  // user signs in, refetch connections (the mount-time fetch ran signed-out).
  const prevSignedIn = useRef(cloudImport);
  useEffect(() => {
    if (cloudImport && !prevSignedIn.current) refresh();
    prevSignedIn.current = cloudImport;
  }, [cloudImport, refresh]);

  const currentRef = crumbs[crumbs.length - 1]?.ref;
  const currentName = crumbs[crumbs.length - 1]?.name;

  const load = useCallback(async (conn: CloudConnection, ref?: string) => {
    setLoading(true);
    setListError(null);
    try {
      const result = await listCloudFolder(conn.id, conn.provider, ref);
      setEntries(result.entries ?? []);
      if (ref === undefined) {
        setCrumbs([
          { ref: result.rootRef, name: result.rootName ?? conn.account_name },
        ]);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load folder");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSelection = () =>
    onSourceChange({
      origin: "cloud",
      connectionId: "",
      provider: connection?.provider ?? "github",
      ref: "",
      name: "",
    });

  const handleSelectConnection = (conn: CloudConnection) => {
    setConnection(conn);
    if (source.connectionId !== conn.id && source.ref) {
      // Clear the picked folder using the NEW account's provider — the
      // `connection` state still points at the previous account here.
      onSourceChange({
        origin: "cloud",
        connectionId: "",
        provider: conn.provider,
        ref: "",
        name: "",
      });
    }
    load(conn);
  };

  const handleFolderClick = (entry: CloudEntry) => {
    if (entry.type !== "folder" || !connection) return;
    setCrumbs((prev) => [...prev, { ref: entry.ref, name: entry.name }]);
    load(connection, entry.ref);
  };

  const handleCrumbClick = (index: number) => {
    if (!connection) return;
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    load(connection, next[next.length - 1]?.ref);
  };

  const handleRepoGo = async () => {
    const repo = repoInput.trim();
    if (!repo || !connection) return;
    setCrumbs((prev) => [...prev, { ref: repo, name: repo }]);
    setRepoInput("");
    await load(connection, repo);
  };

  const selectFolder = useCallback(
    (ref: string, name: string) => {
      if (!connection) return;
      onSourceChange({
        origin: "cloud",
        connectionId: connection.id,
        provider: connection.provider,
        ref,
        name,
      });
    },
    [connection, onSourceChange]
  );

  // Auto-select whichever folder is currently being viewed. Every navigation
  // path (account pick, folder click, breadcrumb, repo jump) updates `crumbs`,
  // so this reacts to all of them and keeps the import selection in sync.
  useEffect(() => {
    if (!connection || !currentRef) return;
    selectFolder(currentRef, currentName ?? "");
  }, [connection, currentRef, currentName, selectFolder]);

  if (!cloudImport) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-6 text-center">
        <Cloud className="h-6 w-6 text-primary/70" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sign in to link and import cloud accounts.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onRequireAuth}
        >
          <Lock className="h-3.5 w-3.5" /> Sign in
        </Button>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          Linked accounts
        </Label>
        {connLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : connError ? (
          <div className="space-y-2 rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-xs leading-relaxed text-red-400 dark:text-red-300">
            <p className="font-medium">Could not load cloud accounts</p>
            <p className="opacity-80">{connError}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => refresh()}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-6 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              No cloud accounts linked yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onOpenCloudSettings}
            >
              <SettingsIcon className="h-3.5 w-3.5" /> Open Settings → Cloud
            </Button>
          </div>
        ) : (
          <div ref={accountsRef} onKeyDown={handleAccountsKeyDown} className="space-y-1.5">
            {connections.map((conn, i) => (
              <button
                key={conn.id}
                type="button"
                data-account-idx={i}
                onClick={() => handleSelectConnection(conn)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Cloud className="h-4 w-4 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {conn.account_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {PROVIDER_LABELS[conn.provider]}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb + controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={() => {
            setConnection(null);
            setEntries([]);
            setCrumbs([]);
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Accounts
        </Button>
        <div className="gm-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[11px]">
          {crumbs.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleCrumbClick(i)}
              className="flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className="max-w-[120px] truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => load(connection, currentRef)}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* GitHub repo quick-jump */}
      {connection.provider === "github" && (
        <div className="flex items-center gap-2">
          <Input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRepoGo()}
            placeholder="jump to repo: owner/repo"
            className="h-8 font-mono text-xs"
          />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleRepoGo}>
            Go
          </Button>
        </div>
      )}

      {/* Selection indicator */}
      {source.ref && (
        <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
          <p className="truncate text-xs font-medium text-primary">
            Selected: {source.name || source.ref}
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 cursor-pointer text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {listError && (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs font-medium leading-normal text-red-400 dark:text-red-300">
          {listError}
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : entries.length === 0 && !listError ? (
        <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground">
          Empty folder.
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry, i) => (
            <div
              key={`${entry.ref ?? entry.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/10 p-2 transition-colors hover:bg-muted/20"
            >
              {entry.type === "folder" ? (
                <button
                  type="button"
                  onClick={() => handleFolderClick(entry)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-fewer-folder-icon" />
                  <span className="truncate text-xs text-foreground">
                    {entry.name}
                  </span>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileIcon className="h-4 w-4 shrink-0 text-fewer-file-icon" />
                  <span className="truncate text-xs text-foreground">
                    {entry.name}
                  </span>
                  {entry.size ? (
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatBytes(entry.size)}
                    </span>
                  ) : null}
                </div>
              )}
              {entry.webUrl && (
                <a
                  href={entry.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                  title="Open in provider"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}