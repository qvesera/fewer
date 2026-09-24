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
import { FEWER_SAVE_GRAPH } from "@/lib/fewer/keyboardShortcuts";
import { resolveRootLocalPath } from "@/lib/fewer/fileOps";
import type { SavedGraph } from "@/lib/fewer/savedGraphs";
import { buildDbShareUrl } from "@/lib/fewer/savedGraphs";
import {
  buildGraphSaveBody,
  buildShareRequestBody,
  graphSaveError,
  graphSaveUnchanged,
  noChangesToast,
  parseEmailList,
  saveGraphName,
  saveSuccessToast,
  shareCreateError,
  shareCreatedToast,
} from "@/lib/fewer/savedGraphsModel";

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
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SavedGraphsPanelProps {
  onRequireAuth: () => void;
}

export function SavedGraphsPanel({ onRequireAuth }: SavedGraphsPanelProps) {
  const { toast } = useToast();
  const tier = useGraphStore((s) => s.tier);
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
    if (tier === "guest") {
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
  }, [tier, toast]);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  /** Close the save dialog and reset it back to "save as new". */
  const closeSaveDialog = () => {
    setSavingOpen(false);
    setSaveName("");
    setSaveTarget("new");
  };

  /** Success path shared by a new save and an in-place update: reset the dialog,
      refresh the list, then confirm what happened. */
  const finishSave = async (name: string, updating: boolean) => {
    closeSaveDialog();
    await loadGraphs();
    toast(saveSuccessToast(name, updating));
  };

  const handleSave = async () => {
    if (tier === "guest") return onRequireAuth();
    const updating = saveTarget !== "new";
    // Guard: refuse dangerous/oversized values; blank falls back to existing/Untitled.
    const nameError = validateTextField(saveName, { label: "Name", max: 200 });
    if (nameError) {
      toast({ title: "Could not save", description: nameError, variant: "destructive" });
      return;
    }
    // The graph being updated, or null for a brand-new save.
    const target = updating ? saveTarget : null;
    const name = saveGraphName(saveName, target?.name ?? null);
    setSaving(true);
    try {
      // Refresh the graph's root local path (if resolvable) so it's persisted
      // with the save and re-openable later without re-searching the system.
      await resolveRootLocalPath();
      const data = buildSnapshot();
      // When updating an existing graph, validate against its saved data first:
      // an identical snapshot means nothing changed, so skip the write (and skip
      // creating a redundant version) and just tell the user.
      if (graphSaveUnchanged(updating, data, target?.data ?? null)) {
        closeSaveDialog();
        toast(noChangesToast(target?.name ?? ""));
        return;
      }
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sending the existing graph's id makes the API update it in place
        // (keeping its share link) and records a new version history snapshot.
        body: JSON.stringify(buildGraphSaveBody(name, data, target?.id ?? null)),
      });
      const json = await res.json();
      const saveError = graphSaveError(res, json);
      if (saveError) {
        toast({ title: "Could not save", description: saveError, variant: "destructive" });
        return;
      }
      await finishSave(name, updating);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openSaveDialog = () => {
    if (tier === "guest") return onRequireAuth();
    if (nodes.length === 0) {
      toast({ title: "Nothing to save", description: "Add cards to your canvas first." });
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
  }, [tier, nodes.length, onRequireAuth, toast]);

  const handleLoad = (graph: SavedGraph) => {
    try {
      applySnapshot(graph.data);
      toast({ title: "Loaded", description: `"${graph.name}" loaded.` });
    } catch {
      toast({ title: "Could not load", description: "This graph may be incompatible.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (tier === "guest") return;
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
    if (tier === "guest") return;
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
          {tier !== "guest" ? "No saved graphs yet. Save one to access it from any device." : "Sign in to save and access your directories."}
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
                      {nodeCount(g)} cards · {timeAgo(g.updated_at)}
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
        <DialogContent dialogTitle="Save" dialogIcon={<Save className="h-3.5 w-3.5" />} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
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
  const { toast } = useToast();
  const tier = useGraphStore((s) => s.tier);
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
    if (tier === "guest") return;
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
  }, [tier, graph.id]);

  /** Invite list for the request. A malformed entry rejects the whole list
      (pre-existing behaviour) and warns with the first offender. */
  const inviteEmails = (): string[] => {
    const parsed = parseEmailList(emails);
    if (parsed.invalid.length === 0) return parsed.emails;
    toast({
      title: "Invalid email",
      description: `"${parsed.invalid[0]}" is not a valid email.`,
      variant: "destructive",
    });
    return [];
  };

  /** Record the created share and confirm it in the mode that was chosen. */
  const applyShareResult = (id: string, invitedEmails: string[]) => {
    setExistingId(id);
    setShareUrl(buildDbShareUrl(id));
    const confirmation = shareCreatedToast({
      access,
      gallery,
      galleryTitle,
      graphName: graph.name,
      inviteeCount: invitedEmails.length,
    });
    if (confirmation) toast(confirmation);
  };

  const buildShare = async () => {
    if (tier === "guest") return onRequireAuth();
    const invited_emails = access === "invite" ? inviteEmails() : [];
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
        body: JSON.stringify(
          buildShareRequestBody({
            data: graph.data,
            access,
            invitedEmails: invited_emails,
            savedGraphId: graph.id,
            name: graph.name,
            gallery,
            galleryTitle,
            galleryDescription,
          }),
        ),
      });
      const json = await res.json();
      const shareError = shareCreateError(res, json);
      if (shareError) {
        toast({ title: "Could not share", description: shareError, variant: "destructive" });
        return;
      }
      applyShareResult(json.id, invited_emails);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Share failed";
      toast({ title: "Could not share", description: msg, variant: "destructive" });
    } finally {
      setBuilding(false);
    }
  };

  const handleUnshare = async () => {
    if (tier === "guest" || !existingId) return;
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
      <DialogContent minimizeCloses={false} dialogTitle="Share" dialogIcon={<Link2 className="h-3.5 w-3.5 text-purple-500" />} className="sm:max-w-md">
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
          {tier !== "guest" && access === "public" && (
            <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">List in the public gallery</p>
                  <p className="text-[11px] text-muted-foreground/70">Anyone can browse this graph from the community gallery.</p>
                </div>
                <Switch checked={gallery} onCheckedChange={(checked) => setGallery(checked)} className="ml-auto shrink-0" />
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
                  {gallery && (!profile.first_name.trim() || !profile.username.trim()) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Your gallery entry will show as Anonymous. Add your name in{" "}
                      <button type="button" onClick={() => { /* handled by parent — open settings */ }} className="underline cursor-pointer">
                        Settings → Account
                      </button>{" "}
                      to show attribution.
                    </p>
                  )}
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
