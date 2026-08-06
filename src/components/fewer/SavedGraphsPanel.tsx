"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useGraphStore } from "@/store/graphStore";
import { buildSnapshot, applySnapshot } from "@/lib/fewer/snapshot";
import type { SavedGraph } from "@/lib/fewer/savedGraphs";
import { buildDbShareUrl } from "@/lib/fewer/savedGraphs";
import { useAuth } from "@/hooks/use-auth";
import {
  FolderOpen,
  Save,
  Trash2,
  Link2,
  Loader2,
  Pencil,
  Check,
  X,
  Copy,
  Globe,
  Mail,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SavedGraphsPanelProps {
  onRequireAuth: () => void;
}

export function SavedGraphsPanel({ onRequireAuth }: SavedGraphsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const nodes = useGraphStore((s) => s.nodes);
  const [graphs, setGraphs] = useState<SavedGraph[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingOpen, setSavingOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState<SavedGraph | null>(null);

  const loadGraphs = useCallback(async () => {
    if (!user) {
      setGraphs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/graphs");
      if (res.status === 401) {
        setGraphs([]);
        return;
      }
      const json = await res.json();
      if (res.ok && Array.isArray(json.graphs)) setGraphs(json.graphs);
    } catch {
      toast({ title: "Could not load saved graphs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  const handleSave = async () => {
    if (!user) return onRequireAuth();
    const name = saveName.trim() || "Untitled";
    setSaving(true);
    try {
      const data = buildSnapshot();
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavingOpen(false);
      setSaveName("");
      await loadGraphs();
      toast({ title: "Saved", description: `"${name}" saved to your account.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (graph: SavedGraph) => {
    try {
      applySnapshot(graph.data);
      toast({ title: "Loaded", description: `"${graph.name}" loaded.` });
    } catch {
      toast({ title: "Could not load", description: "This graph may be incompatible.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/graphs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setGraphs((g) => g.filter((x) => x.id !== id));
      toast({ title: "Deleted", description: `"${name}" removed.` });
    } catch {
      toast({ title: "Could not delete", variant: "destructive" });
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    try {
      const graph = graphs.find((g) => g.id === id);
      if (!graph) return;
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, data: graph.data }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setRenamingId(null);
      await loadGraphs();
    } catch {
      toast({ title: "Could not rename", variant: "destructive" });
    }
  };

  const nodeCount = (g: SavedGraph) => g.data?.nodes?.length ?? 0;

  return (
    <div className="space-y-2.5 w-full min-w-0">
      {/* Save button */}
      <Button
        className="w-full gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 h-10"
        onClick={() => {
          if (!user) return onRequireAuth();
          if (nodes.length === 0) {
            toast({ title: "Nothing to save", description: "Add nodes to your canvas first." });
            return;
          }
          setSavingOpen(true);
        }}
      >
        <Save className="h-4 w-4 shrink-0" />
        Save Current Graph
      </Button>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : graphs.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
          {user ? "No saved graphs yet. Save one to access it from any device." : "Sign in to save and access your directories."}
        </p>
      ) : (
        <div className="space-y-1.5 w-full min-w-0">
          {graphs.map((g) => (
            <div
              key={g.id}
              className="group flex items-center gap-1.5 rounded-lg border border-border/30 bg-muted/10 p-1.5 w-full min-w-0"
            >
              <button
                type="button"
                onClick={() => handleLoad(g)}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                title={`Load ${g.name}`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                {renamingId === g.id ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(g.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    autoFocus
                    className="h-6 text-xs px-1.5"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate text-[11px] text-foreground/90 flex-1 min-w-0">
                    {g.name}
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      {nodeCount(g)} nodes
                    </span>
                  </span>
                )}
              </button>

              {/* Row actions */}
              {renamingId === g.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleRename(g.id)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-green-500 hover:bg-foreground/10 cursor-pointer"
                    title="Save name"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setRenamingId(g.id); setRenameValue(g.name); }}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharing(g)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Share"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id, g.name)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Save dialog */}
      <Dialog open={savingOpen} onOpenChange={setSavingOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              Save Graph
            </DialogTitle>
            <DialogDescription>
              Save the current graph to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="save-name" className="text-xs font-medium">Name</Label>
            <Input
              id="save-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. My Project"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSavingOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 cursor-pointer">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      {sharing && (
        <ShareGraphDialog
          graph={sharing}
          onClose={() => setSharing(null)}
          onRequireAuth={onRequireAuth}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Share sub-dialog: public vs invite                                         */
/* -------------------------------------------------------------------------- */

function ShareGraphDialog({
  graph,
  onClose,
  onRequireAuth,
}: {
  graph: SavedGraph;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [access, setAccess] = useState<"public" | "invite">("public");
  const [emails, setEmails] = useState("");
  const [building, setBuilding] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const buildShare = async (a: "public" | "invite") => {
    if (!user) return onRequireAuth();
    setAccess(a);
    setBuilding(true);
    setShareUrl("");
    try {
      const invited_emails = a === "invite"
        ? emails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
        : [];
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: graph.data,
          access: a,
          invited_emails,
          saved_graph_id: graph.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.id) throw new Error(json.error || "Share failed");
      setShareUrl(buildDbShareUrl(json.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Share failed";
      toast({ title: "Could not share", description: msg, variant: "destructive" });
    } finally {
      setBuilding(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-purple-500" />
            Share "{graph.name}"
          </DialogTitle>
          <DialogDescription>
            Choose who can view this graph.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Access choice */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => buildShare("public")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left cursor-pointer transition-all ${access === "public" ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-accent/40"}`}
            >
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Anyone with the link</p>
                <p className="text-[11px] text-muted-foreground/70">Anyone can open this graph.</p>
              </div>
              <Switch checked={access === "public"} onCheckedChange={() => buildShare("public")} className="ml-auto shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => buildShare("invite")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left cursor-pointer transition-all ${access === "invite" ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-accent/40"}`}
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Invite only</p>
                <p className="text-[11px] text-muted-foreground/70">Only invited emails can open it.</p>
              </div>
              <Switch checked={access === "invite"} onCheckedChange={() => buildShare("invite")} className="ml-auto shrink-0" />
            </button>
          </div>

          {/* Invite emails */}
          {access === "invite" && (
            <div className="space-y-1.5">
              <Label htmlFor="invite-emails" className="text-xs font-medium">Invited emails</Label>
              <Input
                id="invite-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="a@example.com, b@example.com"
                onBlur={() => buildShare("invite")}
              />
              <p className="text-[11px] text-muted-foreground/70">
                Comma-separated. Regenerate the link after editing.
              </p>
            </div>
          )}

          {/* Link */}
          {shareUrl && (
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="text-xs font-mono flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={building} className="gap-1.5 shrink-0 cursor-pointer">
                {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}