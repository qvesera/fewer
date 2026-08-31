"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { safeText, validateTextField } from "@/lib/fewer/textValidation";
import { useProfile } from "@/hooks/use-profile";
import { useGraphStore } from "@/store/graphStore";
import { buildSnapshot, applySnapshot } from "@/lib/fewer/snapshot";
import { graphDataEqual } from "@/lib/fewer/versions";
import { FEWER_SAVE_GRAPH } from "@/lib/fewer/keyboardShortcuts";
import { resolveRootLocalPath } from "@/lib/fewer/fileOps";
import type { SavedGraph } from "@/lib/fewer/savedGraphs";
import { buildDbShareUrl } from "@/lib/fewer/savedGraphs";
import { useAuth } from "@/hooks/use-auth";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
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
  Star,
  Share2,
  History,
  Globe2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogDragHandle,
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
  const [saveTarget, setSaveTarget] = useState<"new" | SavedGraph>("new");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState<SavedGraph | null>(null);
  const [historyFor, setHistoryFor] = useState<SavedGraph | null>(null);

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
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      if (Array.isArray(json.graphs)) setGraphs(json.graphs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load saved graphs";
      toast({ title: "Could not load saved graphs", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  const handleSave = async () => {
    if (!user) return onRequireAuth();
    const updating = saveTarget !== "new";
    // Guard: refuse dangerous/oversized values; blank falls back to existing/Untitled.
    const nameError = validateTextField(saveName, { label: "Name", max: 200 });
    if (nameError) {
      toast({ title: "Could not save", description: nameError, variant: "destructive" });
      return;
    }
    const name = safeText(saveName) || (updating ? saveTarget.name : "Untitled");
    setSaving(true);
    try {
      // Refresh the graph's root local path (if resolvable) so it's persisted
      // with the save and re-openable later without re-searching the system.
      await resolveRootLocalPath();
      const data = buildSnapshot();
      // When updating an existing graph, validate against its saved data first:
      // an identical snapshot means nothing changed, so skip the write (and skip
      // creating a redundant version) and just tell the user.
      if (updating && graphDataEqual(data, saveTarget.data)) {
        setSavingOpen(false);
        setSaveName("");
        setSaveTarget("new");
        toast({
          title: "No changes",
          description: `"${saveTarget.name}" is already up to date — no new version was added.`,
        });
        return;
      }
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sending the existing graph's id makes the API update it in place
        // (keeping its share link) and records a new version history snapshot.
        body: JSON.stringify(updating ? { id: saveTarget.id, name, data } : { name, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavingOpen(false);
      setSaveName("");
      setSaveTarget("new");
      await loadGraphs();
      toast({
        title: updating ? "Graph updated" : "Saved",
        description: updating ? `"${name}" updated with a new version.` : `"${name}" saved to your account.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openSaveDialog = () => {
    if (!user) return onRequireAuth();
    if (nodes.length === 0) {
      toast({ title: "Nothing to save", description: "Add nodes to your canvas first." });
      return;
    }
    setSaveTarget("new");
    setSavingOpen(true);
  };

  // Alt+S (KeyboardShortcuts) opens the same save dialog as the button.
  useEffect(() => {
    const trigger = () => openSaveDialog();
    window.addEventListener(FEWER_SAVE_GRAPH, trigger);
    return () => window.removeEventListener(FEWER_SAVE_GRAPH, trigger);
  }, [user, nodes.length, onRequireAuth, toast]);

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
    const nameError = validateTextField(renameValue, { label: "Name", max: 200 });
    if (nameError) {
      toast({ title: "Could not rename", description: nameError, variant: "destructive" });
      return;
    }
    const name = safeText(renameValue);
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

  const handleFavorite = async (graph: SavedGraph) => {
    if (!user) return;
    const next = !graph.is_favorite;
    // Optimistic update; reverted on failure.
    setGraphs((gs) => gs.map((g) => (g.id === graph.id ? { ...g, is_favorite: next } : g)));
    try {
      const res = await fetch(`/api/graphs/${graph.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (!res.ok) throw new Error("Pin failed");
    } catch {
      setGraphs((gs) => gs.map((g) => (g.id === graph.id ? { ...g, is_favorite: !next } : g)));
      toast({ title: "Could not pin", variant: "destructive" });
    }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="space-y-2.5 w-full min-w-0">
      {/* Save button */}
      <Button
        className="w-full gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 h-10"
        onClick={openSaveDialog}
      >
        <Save className="h-4 w-4 shrink-0" />
        Save
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
          {[...graphs]
            .sort((a, b) => Number(b.is_favorite ?? false) - Number(a.is_favorite ?? false))
            .map((g) => (
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
                    {g.share && (
                      <span
                        className="inline-flex mr-1 align-middle"
                        title={g.share.access === "invite" ? "Invite-only share" : "Anyone with the link"}
                      >
                        {g.share.access === "invite" ? (
                          <Mail className="h-3 w-3 text-purple-500" />
                        ) : (
                          <Globe className="h-3 w-3 text-sky-500" />
                        )}
                      </span>
                    )}
                    {g.name}
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      {nodeCount(g)} nodes · {timeAgo(g.updated_at)}
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
                    onClick={() => handleFavorite(g)}
                    className={`h-5 w-5 shrink-0 flex items-center justify-center rounded hover:bg-foreground/10 transition-opacity ${
                      g.is_favorite
                        ? "text-amber-500"
                        : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                    }`}
                    title={g.is_favorite ? "Unpin from top" : "Pin to top"}
                  >
                    <Star className="h-3 w-3" fill={g.is_favorite ? "currentColor" : "none"} />
                  </button>
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
                    onClick={() => setHistoryFor(g)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Version history"
                  >
                    <History className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharing(g)}
                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Share"
                  >
                    <Share2 className="h-3 w-3" />
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
        <DialogContent dialogTitle="Save Graph" dialogIcon={<Save className="h-3.5 w-3.5 text-primary" />} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DialogDragHandle />
              <Save className="h-4 w-4 text-primary" />
              Save
            </DialogTitle>
            <DialogDescription>
              Save the current graph to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Destination</Label>
              <Select
                value={saveTarget === "new" ? "__new__" : saveTarget.id}
                onValueChange={(v) => {
                  if (v === "__new__") { setSaveTarget("new"); return; }
                  const g = graphs.find((x) => x.id === v);
                  if (g) { setSaveTarget(g); setSaveName(g.name); }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a destination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">Create a new graph</SelectItem>
                  {graphs.map((g) => (
                    <SelectItem key={g.id} value={g.id}>Update “{g.name}”</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/70">
                Updating an existing graph keeps its share link and records a new version.
              </p>
            </div>
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

      {/* History dialog */}
      {historyFor && (
        <VersionHistoryDialog
          graph={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}

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
  const [access, setAccess] = useState<"none" | "public" | "invite">("none");
  const [emails, setEmails] = useState("");
  const [building, setBuilding] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [unsharing, setUnsharing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [galleryTitle, setGalleryTitle] = useState("");
  const [galleryDescription, setGalleryDescription] = useState("");
  const profile = useProfile();

  // Publishing to the gallery requires the user to have shared their name and a
  // username (that's how gallery entries are attributed). If either is missing,
  // bounce the user to Settings → Account to fill them in and block the publish.
  const requireGalleryProfile = (): boolean => {
    if (profile.first_name.trim() && profile.username.trim()) return true;
    toast({
      title: "Profile required",
      description: "Add your first name and a username to list a graph in the gallery.",
      variant: "destructive",
    });
    window.dispatchEvent(new Event("fewer-open-settings-account"));
    return false;
  };

  // Load any existing share link for this saved graph on open.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch(`/api/share?saved_graph_id=${graph.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.share) return;
        setExistingId(json.share.id);
        setAccess(json.share.access);
        if (json.share.access === "invite" && Array.isArray(json.share.invited_emails)) {
          setEmails(json.share.invited_emails.join(", "));
        }
        setShareUrl(buildDbShareUrl(json.share.id));
        setGallery(json.share.in_gallery === true);
        setGalleryTitle(json.share.gallery_title ?? "");
        setGalleryDescription(json.share.gallery_description ?? "");
      })
      .catch(() => { /* no existing share */ });
    return () => { cancelled = true; };
  }, [user, graph.id]);

  const parseEmails = (): string[] => {
    const list = emails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of list) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        toast({ title: "Invalid email", description: `"${e}" is not a valid email.`, variant: "destructive" });
        return [];
      }
      if (!seen.has(e)) { seen.add(e); out.push(e); }
    }
    return out;
  };

  const buildShare = async () => {
    if (!user) return onRequireAuth();
    const invited_emails = access === "invite" ? parseEmails() : [];
    if (access === "invite" && invited_emails.length === 0) {
      toast({ title: "Add at least one email", description: "Enter the emails to invite.", variant: "destructive" });
      return;
    }
    if (gallery && access === "public" && !requireGalleryProfile()) return;
    const titleError = validateTextField(galleryTitle, { label: "Gallery title", max: 200 });
    if (titleError) {
      toast({ title: "Could not share", description: titleError, variant: "destructive" });
      return;
    }
    const descError = validateTextField(galleryDescription, { label: "Gallery description", max: 1000 });
    if (descError) {
      toast({ title: "Could not share", description: descError, variant: "destructive" });
      return;
    }
    setBuilding(true);
    setShareUrl("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: graph.data,
          access,
          invited_emails,
          saved_graph_id: graph.id,
          name: graph.name,
          in_gallery: gallery && access === "public",
          gallery_title: safeText(galleryTitle),
          gallery_description: safeText(galleryDescription),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.id) throw new Error(json.error || "Share failed");
      setExistingId(json.id);
      setShareUrl(buildDbShareUrl(json.id));
      if (gallery && access === "public") {
        toast({
          title: "Published to the gallery",
          description: `"${galleryTitle.trim() || graph.name}" is now live in the community gallery.`,
        });
      } else if (access === "invite") {
        toast({ title: "Invites sent", description: `Emailed ${invited_emails.length} invitee${invited_emails.length === 1 ? "" : "s"} a private link.` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Share failed";
      toast({ title: "Could not share", description: msg, variant: "destructive" });
    } finally {
      setBuilding(false);
    }
  };

  const handleUnshare = async () => {
    if (!user || !existingId) return;
    setUnsharing(true);
    try {
      const res = await fetch(`/api/share?saved_graph_id=${graph.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Unshare failed");
      setExistingId(null);
      setShareUrl("");
      setAccess("none");
      setEmails("");
      setGallery(false);
      setGalleryTitle("");
      setGalleryDescription("");
      toast({ title: "Share link removed" });
    } catch {
      toast({ title: "Could not remove share", variant: "destructive" });
    } finally {
      setUnsharing(false);
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
      <DialogContent dialogTitle="Share" dialogIcon={<Link2 className="h-3.5 w-3.5 text-purple-500" />} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DialogDragHandle />
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
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAccess("public")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAccess("public"); } }}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left cursor-pointer transition-all ${access === "public" ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-accent/40"}`}
            >
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Anyone with the link</p>
                <p className="text-[11px] text-muted-foreground/70">Anyone can open this graph.</p>
              </div>
              <Switch checked={access === "public"} onClick={(e) => e.stopPropagation()} onCheckedChange={(checked) => setAccess(checked ? "public" : "none")} className="ml-auto shrink-0" />
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => setAccess("invite")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAccess("invite"); } }}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left cursor-pointer transition-all ${access === "invite" ? "border-primary/50 bg-primary/5" : "border-border/50 hover:bg-accent/40"}`}
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs font-medium">Invite only</p>
                <p className="text-[11px] text-muted-foreground/70">Only invited emails can open it.</p>
              </div>
              <Switch checked={access === "invite"} onClick={(e) => e.stopPropagation()} onCheckedChange={(checked) => { setAccess(checked ? "invite" : "none"); if (checked) setGallery(false); }} className="ml-auto shrink-0" />
            </div>
          </div>

          {access !== "none" && (
            <p className="text-[11px] text-muted-foreground/70">Signed-in shares never expire. Stop sharing to revoke access.</p>
          )}

          {/* Invite emails */}
          {access === "invite" && (
            <div className="space-y-1.5">
              <Label htmlFor="invite-emails" className="text-xs font-medium">Invited emails</Label>
              <Input
                id="invite-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="a@example.com, b@example.com"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Comma-separated. Click "Generate link" to create the share link.
              </p>
            </div>
          )}

          {/* Gallery opt-in */}
          {user && access === "public" && (
            <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">List in the public gallery</p>
                  <p className="text-[11px] text-muted-foreground/70">Anyone can browse this graph from the community gallery.</p>
                </div>
                <Switch checked={gallery} onCheckedChange={(checked) => { if (checked && !requireGalleryProfile()) return; setGallery(checked); }} className="ml-auto shrink-0" />
              </div>
              {gallery && (
                <div className="space-y-1.5 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="gallery-title" className="text-xs font-medium">Gallery title</Label>
                    <Input
                      id="gallery-title"
                      value={galleryTitle}
                      onChange={(e) => setGalleryTitle(e.target.value)}
                      placeholder={graph.name}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gallery-description" className="text-xs font-medium">Description (optional)</Label>
                    <Input
                      id="gallery-description"
                      value={galleryDescription}
                      onChange={(e) => setGalleryDescription(e.target.value)}
                      placeholder="What makes this graph interesting?"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generate link (hidden when private) */}
          {access === "none" ? (
            <p className="text-[11px] text-muted-foreground/70">
              {existingId
                ? "A share link still exists — use Stop sharing below to make it fully private."
                : "This saved graph is private and visible only to you."}
            </p>
          ) : (
            <Button
              className="w-full gap-1.5 cursor-pointer"
              onClick={buildShare}
              disabled={building}
            >
              {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : gallery && access === "public" ? <Globe2 className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {gallery && access === "public" ? "Publish to gallery" : "Generate link"}
            </Button>
          )}

          {/* Manual share link — hidden in gallery mode (no link to copy; it's live at /gallery) */}
          {shareUrl && access !== "none" && !(gallery && access === "public") && (
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="text-xs font-mono flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={building} className="gap-1.5 shrink-0 cursor-pointer">
                {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>

        {existingId && (
          <DialogFooter className="flex items-center">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleUnshare}
              disabled={unsharing}
              className="gap-1.5 cursor-pointer"
            >
              {unsharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Stop sharing
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
