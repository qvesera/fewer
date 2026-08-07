"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph } from "@/lib/fewer/treeToGraph";
import { useConnections, listCloudFolder, buildCloudTree, PROVIDER_LABELS } from "@/hooks/use-cloud";
import { Folder, FileIcon, Loader2, ChevronRight, ExternalLink, Cloud, ArrowLeft, RefreshCw } from "lucide-react";
import type { CloudConnection, CloudEntry, CloudProvider } from "@/lib/fewer/cloud/types";

interface CloudBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloudBrowserDialog({ open, onOpenChange }: CloudBrowserDialogProps) {
  const { toast } = useToast();
  const { connections, loading: connLoading, refresh } = useConnections();
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [provider, setProvider] = useState<CloudProvider>("github");
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [rootName, setRootName] = useState("");
  const [crumbs, setCrumbs] = useState<{ ref?: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [depth, setDepth] = useState(6);

  const currentRef = crumbs[crumbs.length - 1]?.ref;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setEntries([]);
      setCrumbs([]);
      setRootName("");
      setConnection(null);
      setProvider("github");
      refresh();
    }
  }, [open, refresh]);

  const load = useCallback(
    async (conn: CloudConnection, ref?: string) => {
      setLoading(true);
      try {
        const result = await listCloudFolder(conn.id, conn.provider, ref);
        setEntries(result.entries ?? []);
        if (ref === undefined) {
          setRootName(result.rootName ?? conn.account_name);
          setCrumbs([{ ref: result.rootRef, name: result.rootName ?? conn.account_name }]);
        }
      } catch (err) {
        toast({ title: "Could not load folder", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const handleSelectConnection = (conn: CloudConnection) => {
    setConnection(conn);
    setProvider(conn.provider);
    load(conn);
  };

  const handleFolderClick = (entry: CloudEntry) => {
    if (entry.type !== "folder") return;
    setCrumbs((prev) => [...prev, { ref: entry.ref, name: entry.name }]);
    if (connection) load(connection, entry.ref);
  };

  const handleCrumbClick = (index: number) => {
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    if (connection) load(connection, next[next.length - 1]?.ref);
  };

  // GitHub: quick-start by typing owner/repo
  const handleRepoGo = async () => {
    const repo = repoInput.trim();
    if (!repo || !connection) return;
    setCrumbs((prev) => [...(prev.length ? prev : [{ ref: `${repo}`, name: repo }])]);
    setRepoInput("");
    await load(connection, repo);
  };

  const handleImport = async () => {
    if (!connection || !currentRef) return;
    setImporting(true);
    try {
      const tree = await buildCloudTree(connection.id, provider, currentRef, depth);
      if (!tree) throw new Error("Empty tree");
      const { nodes, edges, hiddenFileIds } = treeToGraph(tree, { idPrefix: `cloud-${provider}` });
      useGraphStore.setState({ dataSource: `cloud:${provider}` });
      useGraphStore.getState().setGraph(nodes, edges, false, hiddenFileIds);
      useGraphStore.getState().setEdgeStyle(useGraphStore.getState().edgeStyle);
      toast({ title: "Imported from cloud", description: `${tree.name}: ${nodes.length} entries` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const selected = connection;
  const crumbsPath = crumbs.map((c) => c.name).join(" / ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background/95 backdrop-blur-md border border-border/40 shadow-xl">
        <DialogHeader className="pb-3 border-b border-border/20">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Cloud className="h-5 w-5 text-primary/80" />
            Browse Cloud Storage
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-normal font-normal mt-1">
            Browse a linked cloud account and import a folder into the graph. Read-only — nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 min-h-[300px] max-h-[60vh] overflow-y-auto gm-scroll">
          {/* Step 1: pick a connection */}
          {!selected && (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Linked accounts</Label>
              {connLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
              ) : connections.length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground leading-relaxed">
                  No cloud accounts linked yet. Link one from the <span className="font-medium text-foreground">Cloud</span> section in the sidebar.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {connections.map((conn) => (
                    <button
                      key={conn.id}
                      onClick={() => handleSelectConnection(conn)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3 text-left hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <Cloud className="h-4 w-4 text-primary/70" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{conn.account_name}</p>
                        <p className="text-[10px] text-muted-foreground">{PROVIDER_LABELS[conn.provider]}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: browse */}
          {selected && (
            <>
              {/* Breadcrumb + back */}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setConnection(null)}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Accounts
                </Button>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[11px] gm-scroll">
                  {crumbs.map((c, i) => (
                    <button key={i} onClick={() => handleCrumbClick(i)} className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer">
                      {i > 0 && <ChevronRight className="h-3 w-3" />}
                      <span className="truncate max-w-[120px]">{c.name}</span>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => connection && load(connection, currentRef)} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* GitHub repo quick-jump */}
              {provider === "github" && (
                <div className="flex items-center gap-2">
                  <Input
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRepoGo()}
                    placeholder="jump to repo: owner/repo"
                    className="h-8 text-xs font-mono"
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleRepoGo}>Go</Button>
                </div>
              )}

              {/* Entry list */}
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-6"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
              ) : entries.length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground">Empty folder.</div>
              ) : (
                <div className="space-y-1">
                  {entries.map((entry, i) => (
                    <div key={`${entry.ref ?? entry.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/10 p-2 hover:bg-muted/20 transition-colors">
                      {entry.type === "folder" ? (
                        <button onClick={() => handleFolderClick(entry)} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
                          <Folder className="h-4 w-4 shrink-0 text-fewer-folder-icon" />
                          <span className="truncate text-xs text-foreground">{entry.name}</span>
                        </button>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0 text-fewer-file-icon" />
                          <span className="truncate text-xs text-foreground">{entry.name}</span>
                          {entry.size ? <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">{formatBytes(entry.size)}</span> : null}
                        </div>
                      )}
                      {entry.webUrl && (
                        <a href={entry.webUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 text-muted-foreground hover:text-foreground" title="Open in provider">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-border/20 flex flex-row items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Label htmlFor="depth" className="shrink-0">Depth</Label>
            <Input id="depth" type="number" min={1} max={20} value={depth} onChange={(e) => setDepth(Number(e.target.value) || 6)} className="h-7 w-16 text-xs" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="default" className="text-xs border-border/80" onClick={() => onOpenChange(false)} disabled={importing}>
              Cancel
            </Button>
            <Button size="default" onClick={handleImport} disabled={!selected || !currentRef || importing || loading} className="text-xs bg-gradient-to-r from-primary to-primary text-white hover:opacity-90 gap-1.5">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {importing ? "Importing…" : "Import Folder"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}