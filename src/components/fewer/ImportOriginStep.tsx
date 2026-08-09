"use client";

/**
 * Step 1 of the unified 3-step import flow: select origin + pick source.
 * This is the ONLY place origin-specific configuration UI lives.
 * Step 2 (shared ImportOptionsPanel) and step 3 (per-origin action) are
 * handled by ImportFlowDialog.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BellRing,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  FileIcon,
  FileJson,
  FileTerminal,
  Folder as FolderIcon,
  FolderOpen,
  FolderTree,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFileSystemAccessSupported } from "@/lib/fewer/fileSystem";
import {
  listCloudFolder,
  PROVIDER_LABELS,
  useConnections,
} from "@/hooks/use-cloud";
import type { CloudConnection, CloudEntry } from "@/lib/fewer/cloud/types";
import {
  ORIGIN_META,
  defaultSourceFor,
  isGitHubUrl,
} from "@/lib/fewer/importFlow";
import type {
  FileImportFormat,
  ImportOrigin,
  OriginSource,
} from "@/lib/fewer/importFlow";

export interface ImportOriginStepProps {
  origin: ImportOrigin;
  onOriginChange: (origin: ImportOrigin) => void;
  source: OriginSource;
  onSourceChange: (source: OriginSource) => void;
  advancedModeEnabled: boolean;
  signedIn: boolean;
  onRequireAuth: () => void;
  onOpenCloudSettings: () => void;
}

const ORIGINS: ImportOrigin[] = ["folder", "file", "url", "cloud"];

const ORIGIN_ICONS: Record<ImportOrigin, LucideIcon> = {
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
  advancedModeEnabled,
  signedIn,
  onRequireAuth,
  onOpenCloudSettings,
}: ImportOriginStepProps) {
  return (
    <div className="space-y-4">
      {/* ── Origin selection ── */}
      <div className="grid grid-cols-2 gap-2">
        {ORIGINS.map((o) => {
          const Icon = ORIGIN_ICONS[o];
          const active = o === origin;
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                if (!active) {
                  onOriginChange(o);
                  onSourceChange(defaultSourceFor(o));
                }
              }}
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

      {/* ── Origin-specific source picking ── */}
      {origin === "folder" && <FolderSource />}
      {origin === "file" && (
        <FileSource
          source={source as Extract<OriginSource, { origin: "file" }>}
          onSourceChange={onSourceChange}
          advancedModeEnabled={advancedModeEnabled}
        />
      )}
      {origin === "url" && (
        <UrlSource
          source={source as Extract<OriginSource, { origin: "url" }>}
          onSourceChange={onSourceChange}
          signedIn={signedIn}
          onRequireAuth={onRequireAuth}
        />
      )}
      {origin === "cloud" && (
        <CloudSource
          source={source as Extract<OriginSource, { origin: "cloud" }>}
          onSourceChange={onSourceChange}
          signedIn={signedIn}
          onRequireAuth={onRequireAuth}
          onOpenCloudSettings={onOpenCloudSettings}
        />
      )}
    </div>
  );
}

/* ────────────────────────── Folder ────────────────────────── */

function FolderSource() {
  // Resolve client-side only to avoid SSR hydration mismatch.
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(isFileSystemAccessSupported());
  }, []);

  if (!supported) {
    // pickDirectoryTree falls back to <input webkitdirectory> — still works,
    // just with the legacy picker.
    return (
      <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
        <FolderOpen className="mb-1.5 h-4 w-4 text-muted-foreground/80" />
        Your device's folder picker opens when you press{" "}
        <span className="font-medium text-foreground">Import</span>. This
        browser uses the legacy picker — everything still stays local.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
      <FolderOpen className="mb-1.5 h-4 w-4 text-muted-foreground/80" />
      Your device's folder picker opens when you press{" "}
      <span className="font-medium text-foreground">Import</span>. Everything
      is processed locally — nothing is uploaded.
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
];

const FILE_PLACEHOLDERS: Record<FileImportFormat, string> = {
  json: `{\n  "nodes": [...],\n  "edges": [...]\n}`,
  tree: `root_project_folder/\n├── src/\n│   ├── App.tsx\n│   └── main.tsx\n└── package.json`,
  script: `mkdir -p "src/components"\nmkdir -p "src/hooks"\nmkdir -p "public"`,
};

function FileSource({
  source,
  onSourceChange,
  advancedModeEnabled,
}: {
  source: Extract<OriginSource, { origin: "file" }>;
  onSourceChange: (source: OriginSource) => void;
  advancedModeEnabled: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formats = advancedModeEnabled
    ? FILE_FORMATS
    : FILE_FORMATS.filter((f) => f.value === "tree");

  // Advanced mode off → only ASCII tree is allowed.
  useEffect(() => {
    if (!advancedModeEnabled && source.format !== "tree") {
      onSourceChange({ ...source, format: "tree" });
    }
  }, [advancedModeEnabled, source, onSourceChange]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const ext = file.name.split(".").pop()?.toLowerCase();
      let format: FileImportFormat = "tree";
      if (advancedModeEnabled && ext === "json") format = "json";
      else if (advancedModeEnabled && (ext === "sh" || ext === "bat"))
        format = "script";
      onSourceChange({ origin: "file", content: text, format });
    };
    reader.onerror = () =>
      onSourceChange({ ...source, content: "", format: source.format });
    reader.readAsText(file);
    // Allow re-selecting the same file.
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          Format
        </Label>
        <div className={cn("grid gap-2", formats.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
          {formats.map((f) => {
            const Icon = f.icon;
            const active = source.format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onSourceChange({ ...source, format: f.value })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3.5 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                )}
              >
                <Icon className="h-4.5 w-4.5 opacity-85" />
                <span className="text-center text-xs font-medium leading-tight">
                  {f.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_FORMATS.find((f) => f.value === source.format)?.accept}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        className="h-10 w-full gap-2 border-border/80 text-xs font-medium text-foreground hover:bg-muted/40"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        Upload file
      </Button>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Or paste content below
        </Label>
        <Textarea
          value={source.content}
          onChange={(e) => onSourceChange({ ...source, content: e.target.value })}
          placeholder={FILE_PLACEHOLDERS[source.format]}
          className="gm-scroll min-h-[140px] max-h-[240px] bg-muted/20 p-3.5 font-mono text-xs font-medium leading-relaxed text-foreground"
        />
      </div>
    </div>
  );
}

/* ────────────────────────── URL ────────────────────────── */

function UrlSource({
  source,
  onSourceChange,
  signedIn,
  onRequireAuth,
}: {
  source: Extract<OriginSource, { origin: "url" }>;
  onSourceChange: (source: OriginSource) => void;
  signedIn: boolean;
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
                {signedIn
                  ? "Daily digest (23:59) when this index changes."
                  : "Sign in to get daily change digests."}
              </p>
            </div>
          </div>
          {signedIn ? (
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
  signedIn,
  onRequireAuth,
  onOpenCloudSettings,
}: {
  source: Extract<OriginSource, { origin: "cloud" }>;
  onSourceChange: (source: OriginSource) => void;
  signedIn: boolean;
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

  // The auth dialog stacks on top without closing the import flow — when the
  // user signs in, refetch connections (the mount-time fetch ran signed-out).
  const prevSignedIn = useRef(signedIn);
  useEffect(() => {
    if (signedIn && !prevSignedIn.current) refresh();
    prevSignedIn.current = signedIn;
  }, [signedIn, refresh]);

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

  const selectFolder = (ref: string, name: string) => {
    if (!connection) return;
    onSourceChange({
      origin: "cloud",
      connectionId: connection.id,
      provider: connection.provider,
      ref,
      name,
    });
  };

  if (!signedIn) {
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
          <div className="space-y-1.5">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                onClick={() => handleSelectConnection(conn)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3 text-left transition-colors hover:bg-muted/20"
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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => currentRef && selectFolder(currentRef, currentName ?? "")}
          disabled={!currentRef}
          title="Select the folder you're viewing"
        >
          <Download className="h-3.5 w-3.5" />
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
              {entry.type === "folder" && entry.ref && (
                <button
                  type="button"
                  onClick={() => selectFolder(entry.ref!, entry.name)}
                  className="shrink-0 cursor-pointer p-1 text-muted-foreground hover:text-foreground"
                  title="Select this folder"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
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