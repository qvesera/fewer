"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { EditableNumber } from "@/components/ui/editable-number";
import { Switch } from "@/components/ui/switch";
import {
  Sun,
  Moon,
  Palette,
  Settings,
  Bug,
  Keyboard,
  RefreshCw,
  Github,
  Globe,
  Mouse,
  HelpCircle,
  Zap,
  Map as MinimapIcon,
  Maximize2,
  BookOpen,
  Newspaper,
  ExternalLink,
  ChevronRight,
  Heart,
  LogIn,
  LogOut,
  User2,
  BellRing,
  Info,
  Check,
  Cloud,
  Trash2,
  Loader2,
  Spline,
  SlidersHorizontal,
} from "lucide-react";
import type { ThemeMode, EdgeStyle, EdgeStrokeStyle } from "@/lib/fewer/types";
import { SlidingToggle } from "../ui/sliding-toggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeEditorDialog, Logo, CloudPanel } from ".";
import { WatchedIndexesPanel } from "./WatchedIndexesPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { validateTextField, validateUsername } from "@/lib/fewer/textValidation";
import { useAuth } from "@/hooks/use-auth";
import { getBrowserSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/* -------------------------------------------------------------------------- */
/*  About tab                                                                 */
/* -------------------------------------------------------------------------- */

function AccountTab() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  // Last values persisted for this user — used to detect unsaved changes.
  const [savedProfile, setSavedProfile] = useState({
    first_name: "",
    last_name: "",
    username: "",
  });

  // Load the stored profile for the signed-in user, if any.
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (mounted && json.profile) {
          const p = json.profile as {
            first_name?: unknown;
            last_name?: unknown;
            username?: unknown;
          };
          const first_name = typeof p.first_name === "string" ? p.first_name : "";
          const last_name = typeof p.last_name === "string" ? p.last_name : "";
          const username = typeof p.username === "string" ? p.username : "";
          setFirstName(first_name);
          setLastName(last_name);
          setUsername(username);
          setSavedProfile({ first_name, last_name, username });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const profileUnchanged =
    firstName.trim() === savedProfile.first_name &&
    lastName.trim() === savedProfile.last_name &&
    username.trim() === savedProfile.username;

  const handleSaveProfile = async () => {
    // Client-side guard: refuse dangerous/oversized values before POSTing.
    const invalid =
      validateTextField(firstName, { label: "First name", max: 100 }) ??
      validateTextField(lastName, { label: "Last name", max: 100 }) ??
      validateUsername(username, { label: "Username", max: 100 });
    if (invalid) {
      toast({ title: "Could not save profile", description: invalid, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Normalized the same way the server stores it (case-insensitive uniqueness).
      const uname = username.trim().toLowerCase();
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: uname,
        }),
      });
      if (!res.ok) {
        let msg = "Could not save profile";
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setUsername(uname);
      setSavedProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: uname,
      });
      toast({ title: "Profile updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save profile";
      toast({ title: "Could not save profile", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await getBrowserSupabase().auth.signOut();
      toast({ title: "Signed out" });
    } catch {
      toast({ title: "Could not sign out", variant: "destructive" });
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        let msg = "Could not delete account";
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      // Sign out locally so the UI reflects the deleted session immediately.
      try {
        await getBrowserSupabase().auth.signOut();
      } catch {
        /* session may already be gone */
      }
      useGraphStore.getState().setSettingsOpen(false);
      setConfirmOpen(false);
      toast({ title: "Account deleted", description: "Your account and data have been removed." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not delete account";
      toast({ title: "Could not delete account", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 py-1">
      {/* Profile Card — only shown to signed-in users */}
      {!loading && user && (
        <div className="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <User2 className="h-4 w-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Profile</span>
              <span className="block text-[11px] text-muted-foreground/70">
                Your name and username, stored with your account
              </span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-first-name" className="text-xs font-medium text-muted-foreground">
                First name
              </Label>
              <Input
                id="profile-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ada"
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-last-name" className="text-xs font-medium text-muted-foreground">
                Last name
              </Label>
              <Input
                id="profile-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Lovelace"
                autoComplete="family-name"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-username" className="text-xs font-medium text-muted-foreground">
                Username
              </Label>
              <Input
                id="profile-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ada"
                autoComplete="username"
                maxLength={100}
              />
              <p className="text-[11px] text-muted-foreground/70">
                Letters, numbers, underscores &amp; dots — no "@".
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={handleSaveProfile}
              disabled={saving || profileUnchanged}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Check className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      )}

      {/* Account Card */}
      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <User2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">
              {loading ? "Loading…" : user ? user.email : "Signed out"}
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              {loading ? "Checking session" : user ? "Account" : "Sign in to save and share graphs"}
            </span>
          </div>
        </div>
        {!loading && (
          user ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                useGraphStore.getState().setSettingsOpen(false);
                setTimeout(() => useGraphStore.getState().setAuthOpen(true), 150);
              }}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Button>
          )
        )}
      </div>
{/* Danger Zone — only shown to signed-in users */}
      {!loading && user && (
        <div className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <Trash2 className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">Delete account</span>
              <span className="text-[11px] text-muted-foreground/70">
                Permanently remove your account, saved graphs, and related data
              </span>
            </div>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account, saved graphs, watch lists, cloud
                  connections, and any shared graphs you own. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="gap-1.5"
                  disabled={deleting}
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteAccount();
                  }}
                >
                  {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {deleting ? "Deleting…" : "Delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  About tab                                                                  */
/* -------------------------------------------------------------------------- */

function AboutTab() {
  return (
    <div className="flex flex-col gap-5 py-1">
      {/* Brand Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/50 p-4 shadow-sm transition-[colors,transform,box-shadow]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 shadow-sm border border-border/40 backdrop-blur-md">
            <Logo size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">fewer</h3>
              <span className="rounded-full bg-accent/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground border border-border/40">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/80 mt-0.5">Interactive File & System Graph Visualizer</p>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground/90 font-normal text-pretty">
        Transform complex file systems into clear, interactive graphs. Explore, search,
        customize, and export with ease. No data is ever uploaded. Processing is completely local.
      </p>

      {/* Action Links */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          size="sm"
          className="group h-10 gap-2 rounded-xl border-border/60 bg-card/40 hover:bg-accent/50 text-xs font-medium text-foreground transition-[colors,transform,box-shadow] hover:border-border active:scale-[0.96]"
          onClick={() => window.open("https://github.com/qvesera/fewer", "_blank", "noreferrer")}
        >
          <Github className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span>GitHub</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="group h-10 gap-2 rounded-xl border-border/60 bg-card/40 hover:bg-accent/50 text-xs font-medium text-foreground transition-[colors,transform,box-shadow] hover:border-border active:scale-[0.96]"
          onClick={() => window.open("https://qvesera.github.io", "_blank", "noreferrer")}
        >
          <Globe className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span>Website</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="col-span-2 group h-10 gap-2 rounded-xl border-border/60 bg-card/40 hover:bg-accent/50 text-xs font-medium text-foreground transition-[colors,transform,box-shadow] hover:border-border active:scale-[0.96]"
          onClick={() => window.open("https://github.com/sponsors/qvesera", "_blank", "noreferrer")}
        >
          <Heart className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span>Sponsor this project!</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground/50 pt-2">
        Built with Next.js, React Flow & shadcn/ui • Released under AGPLv3 License
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Appearance tab                                                            */
/* -------------------------------------------------------------------------- */

function AppearanceTab() {
  const themeMode = useGraphStore((s) => s.themeMode);
  const setThemeMode = useGraphStore((s) => s.setThemeMode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setCornerRadius = useGraphStore((s) => s.setCornerRadius);
  const edgeAnimated = useGraphStore((s) => s.edgeAnimated);
  const setEdgeAnimated = useGraphStore((s) => s.setEdgeAnimated);
  const edgeStrokeStyle = useGraphStore((s) => s.edgeStrokeStyle);
  const setEdgeStrokeStyle = useGraphStore((s) => s.setEdgeStrokeStyle);
  const edgeWidth = useGraphStore((s) => s.edgeWidth);
  const setEdgeWidth = useGraphStore((s) => s.setEdgeWidth);
  const edgeAnimatedSelectedOnly = useGraphStore((s) => s.edgeAnimatedSelectedOnly);
  const setEdgeAnimatedSelectedOnly = useGraphStore((s) => s.setEdgeAnimatedSelectedOnly);
  const edgeAnimatedStrokeStyle = useGraphStore((s) => s.edgeAnimatedStrokeStyle);
  const setEdgeAnimatedStrokeStyle = useGraphStore((s) => s.setEdgeAnimatedStrokeStyle);

  const edgeStyleOptions = useMemo(() => [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ], []);

  const strokeStyleOptions = useMemo(() => {
    const list: { value: EdgeStrokeStyle; label: string }[] = [];
    // "Solid" only makes sense when at least some edges keep a solid base —
    // i.e. not when ALL edges are animated.
    if (!edgeAnimated) {
      list.push({ value: "solid", label: "Solid" });
    }
    list.push({ value: "dashed", label: "Dashed" });
    list.push({ value: "dotted", label: "Dotted" });
    return list;
  }, [edgeAnimated]);

  return (
    <div className="flex flex-col gap-5 py-1">
      <div className="space-y-2.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Theme Preferences
        </Label>
        <div className="grid grid-cols-3 gap-2.5">
          {(advancedModeEnabled ? (["light", "dark", "custom"] as ThemeMode[]) : (["light", "dark"] as ThemeMode[])).map((mode) => {
            const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => {
                  if (mode === "custom") {
                    // Close settings dialog and open the theme editor dialog
                    useGraphStore.getState().setSettingsOpen(false);
                    setTimeout(() => {
                      useGraphStore.getState().setThemeMode("custom");
                      useGraphStore.getState().setThemeEditorOpen(true);
                    }, 150);
                  } else {
                    // Close theme editor dialog when switching to light/dark
                    useGraphStore.getState().setThemeEditorOpen(false);
                    setThemeMode(mode);
                  }
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-[colors,transform,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                  active
                    ? "border-primary/50 bg-primary/5 text-primary shadow-sm font-medium"
                    : "border-border/50 bg-card/30 hover:bg-accent/40 hover:border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", active && "text-primary")} />
                <span className="text-xs capitalize">{mode}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Spline className="h-3.5 w-3.5 text-muted-foreground/70" />
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Edge Styling
          </Label>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Style</Label>
            <SlidingToggle
              options={edgeStyleOptions}
              value={edgeStyle}
              onValueChange={(v) => setEdgeStyle(v as EdgeStyle)}
            />
          </div>

          {advancedModeEnabled && (
            <div className="flex flex-col gap-4 border-t border-border/30 pt-4">
              {edgeStyle === "angled" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">Corner Radius</Label>
                    <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={cornerRadius} onCommit={(v) => setCornerRadius(v)} unit="px" /></span>
                  </div>
                  <Slider
                    value={[cornerRadius]}
                    onValueChange={([v]) => setCornerRadius(v)}
                    min={0}
                    max={20}
                    step={1}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Motion</Label>
                <SlidingToggle
                  options={[
                    { value: "static" as const, label: "Static" },
                    { value: "animated" as const, label: "Animated" },
                  ]}
                  value={edgeAnimated ? "animated" : "static"}
                  onValueChange={(v) => setEdgeAnimated(v === "animated")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Pattern</Label>
                <SlidingToggle
                  options={strokeStyleOptions}
                  value={edgeStrokeStyle}
                  onValueChange={(v) => setEdgeStrokeStyle(v as EdgeStrokeStyle)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Line Thickness</Label>
                  <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={edgeWidth} onCommit={(v) => setEdgeWidth(v)} unit="px" /></span>
                </div>
                <Slider
                  value={[edgeWidth]}
                  onValueChange={([v]) => setEdgeWidth(v)}
                  min={0.5}
                  max={6}
                  step={0.25}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {advancedModeEnabled && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground/70" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Edge Motion
            </Label>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Label
              className="text-xs font-medium text-foreground"
              htmlFor="edge-motion-selected-toggle"
            >
              Animate Selected Edges Only
            </Label>
            <Switch
              id="edge-motion-selected-toggle"
              checked={edgeAnimatedSelectedOnly}
              onCheckedChange={setEdgeAnimatedSelectedOnly}
            />
          </div>
          {edgeAnimatedSelectedOnly && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Selected Edge Pattern
              </Label>
              <SlidingToggle
                options={[
                  { value: "dashed" as const, label: "Dashed" },
                  { value: "dotted" as const, label: "Dotted" },
                ]}
                value={edgeAnimatedStrokeStyle}
                onValueChange={(v) => setEdgeAnimatedStrokeStyle(v as EdgeStrokeStyle)}
              />
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            {edgeAnimatedSelectedOnly
              ? "Only the edges along the selected nodes' path to the root animate — in the chosen dashed/dotted pattern. All other edges follow the Edge Styling controls above."
              : "Turn this on to animate just the selection path; every other edge follows the Edge Styling controls above."}
          </p>
        </div>
      </div>
      )}

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <MinimapIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Minimap
          </Label>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <MinimapControls />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Minimap controls                                                          */
/* -------------------------------------------------------------------------- */

function MinimapControls() {
  const showMiniMap = useGraphStore((s) => s.showMiniMap);
  const setShowMiniMap = useGraphStore((s) => s.setShowMiniMap);
  const miniMapPosition = useGraphStore((s) => s.miniMapPosition);
  const setMiniMapPosition = useGraphStore((s) => s.setMiniMapPosition);
  const miniMapSize = useGraphStore((s) => s.miniMapSize);
  const setMiniMapSize = useGraphStore((s) => s.setMiniMapSize);
  const miniMapX = useGraphStore((s) => s.miniMapX);
  const setMiniMapX = useGraphStore((s) => s.setMiniMapX);
  const miniMapY = useGraphStore((s) => s.miniMapY);
  const setMiniMapY = useGraphStore((s) => s.setMiniMapY);
  const canvasSize = useGraphStore((s) => s.canvasSize);

  // Slider bounds track the live canvas size (never an arbitrary cap): the max
  // keeps the minimap fully on-canvas (canvas size minus the minimap itself),
  // with a floor so the slider stays usable before/if the canvas isn't measured.
  const maxX = Math.max(canvasSize.width - miniMapSize, miniMapSize);
  const maxY = Math.max(canvasSize.height - miniMapSize, miniMapSize);

  const positions = [
    { value: "top-left", label: "Top Left" },
    { value: "top-right", label: "Top Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-right", label: "Bottom Right" },
    { value: "custom", label: "Custom" },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">Enable Minimap</Label>
        <Switch checked={showMiniMap} onCheckedChange={setShowMiniMap} />
      </div>

      {showMiniMap && (
        <>
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground font-medium">Position</Label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((pos) => {
                const active = miniMapPosition === pos.value;
                return (
                  <button
                    key={pos.value}
                    onClick={() => setMiniMapPosition(pos.value)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary font-medium"
                        : "border-border/50 hover:bg-accent/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground font-medium">Size</Label>
              <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={miniMapSize} onCommit={(v) => setMiniMapSize(v)} unit="px" /></span>
            </div>
            <Slider
              value={[miniMapSize]}
              onValueChange={([v]) => setMiniMapSize(v)}
              min={80}
              max={300}
              step={10}
            />
          </div>

          {miniMapPosition === "custom" && (
            <>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground font-medium">X Position</Label>
                  <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={miniMapX} onCommit={(v) => setMiniMapX(v)} unit="px" /></span>
                </div>
                <Slider
                  value={[miniMapX]}
                  onValueChange={([v]) => setMiniMapX(v)}
                  min={0}
                  max={maxX}
                  step={5}
                />
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground font-medium">Y Position</Label>
                  <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={miniMapY} onCommit={(v) => setMiniMapY(v)} unit="px" /></span>
                </div>
                <Slider
                  value={[miniMapY]}
                  onValueChange={([v]) => setMiniMapY(v)}
                  min={0}
                  max={maxY}
                  step={5}
                />
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground/70">Custom position is pinned in place and only moves when you adjust the X / Y sliders above.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Advanced tab                                                              */
/* -------------------------------------------------------------------------- */

function AdvancedTab() {
  const isMobile = useIsMobile();
  const nodeWidth = useGraphStore((s) => s.nodeWidth);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const setNodeDimensions = useGraphStore((s) => s.setNodeDimensions);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const scrollAction = useGraphStore((s) => s.scrollAction);
  const setScrollAction = useGraphStore((s) => s.setScrollAction);
  const maxDisplayDepth = useGraphStore((s) => s.maxDisplayDepth);
  const setMaxDisplayDepth = useGraphStore((s) => s.setMaxDisplayDepth);
  const autoHideThreshold = useGraphStore((s) => s.autoHideThreshold);
  const setAutoHideThreshold = useGraphStore((s) => s.setAutoHideThreshold);
  const shynessScale = useGraphStore((s) => s.shynessScale);
  const setShynessScale = useGraphStore((s) => s.setShynessScale);

  // Crown-shyness slider: local value for live drag preview; the store commit
  // (and relayout) happens on drag release so large graphs don't relayout per tick.
  const [shynessPreview, setShynessPreview] = useState(shynessScale);
  useEffect(() => setShynessPreview(shynessScale), [shynessScale]);

  return (
    <div className="flex flex-col gap-5 py-1">
      {advancedModeEnabled && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/30 pb-2.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Layout Policy
            </Label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium text-foreground">Max Depth</Label>
                <p className="text-[11px] text-muted-foreground/70">Hide nodes deeper than this level.</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-foreground/80">
                <EditableNumber value={maxDisplayDepth} onCommit={(v) => setMaxDisplayDepth(v)} labelFn={(v) => (v === 0 ? "Unlimited" : `${v} lvl`)} />
              </span>
            </div>
            <Slider
              value={[maxDisplayDepth]}
              onValueChange={([v]) => setMaxDisplayDepth(v)}
              min={0}
              max={10}
              step={1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium text-foreground">Auto-hide Limit</Label>
                <p className="text-[11px] text-muted-foreground/70">Auto-collapse folders with more than this number of items.</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-foreground/80"><EditableNumber value={autoHideThreshold} onCommit={(v) => setAutoHideThreshold(v)} unit=" items" /></span>
            </div>
            <Slider
              value={[autoHideThreshold]}
              onValueChange={([v]) => setAutoHideThreshold(v)}
              min={2}
              max={100}
              step={1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium text-foreground">Crown Shyness</Label>
                <p className="text-[11px] text-muted-foreground/70">Extra spacing between sibling branches — wider gaps around larger, deeper branch clusters. 0 disables it.</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-foreground/80">{shynessPreview.toFixed(1)}×</span>
            </div>
            <Slider
              value={[shynessPreview]}
              onValueChange={([v]) => setShynessPreview(v)}
              onValueCommit={([v]) => setShynessScale(v)}
              min={0}
              max={3}
              step={0.1}
              aria-label="Crown shyness intensity"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Changes apply immediately — the graph re-lays itself out as you adjust.
          </p>
        </div>
      )}

      {!isMobile && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/30 pb-2.5">
            <Mouse className="h-3.5 w-3.5 text-primary" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Canvas Navigation
            </Label>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-foreground">Scroll to Zoom</Label>
            <Switch
              checked={scrollAction === "zoom"}
              onCheckedChange={(zoom) => setScrollAction(zoom ? "zoom" : "pan")}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            {scrollAction === "zoom"
              ? "The mouse wheel zooms the canvas directly."
              : "The mouse wheel pans the canvas vertically; hold Ctrl (⌘) and scroll to zoom."}
          </p>
        </div>
      )}

      {advancedModeEnabled && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/30 pb-2.5">
            <Maximize2 className="h-3.5 w-3.5 text-primary" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Node Metrics
            </Label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-normal">Width</Label>
              <span className="text-xs font-mono tabular-nums font-medium text-foreground"><EditableNumber value={nodeWidth} onCommit={(v) => setNodeDimensions(v, nodeHeight)} unit="px" /></span>
            </div>
            <Slider
              value={[nodeWidth]}
              onValueChange={([v]) => setNodeDimensions(v, nodeHeight)}
              min={120}
              max={400}
              step={10}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-normal">Height</Label>
              <span className="text-xs font-mono tabular-nums font-medium text-foreground"><EditableNumber value={nodeHeight} onCommit={(v) => setNodeDimensions(nodeWidth, v)} unit="px" /></span>
            </div>
            <Slider
              value={[nodeHeight]}
              onValueChange={([v]) => setNodeDimensions(nodeWidth, v)}
              min={40}
              max={300}
              step={5}
            />
          </div>
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cloud tab                                                                 */
/* -------------------------------------------------------------------------- */

function CloudTab() {
  const { user, loading } = useAuth();

  const handleBrowse = () => {
    useGraphStore.getState().setSettingsOpen(false);
    setTimeout(() => window.dispatchEvent(new Event("fewer-cloud-browse")), 200);
  };

  const handleRequireAuth = () => {
    useGraphStore.getState().setSettingsOpen(false);
    setTimeout(() => useGraphStore.getState().setAuthOpen(true), 150);
  };

  if (loading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">Checking session…</div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/30 p-6 text-center">
        <Cloud className="h-6 w-6 text-primary/70" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Link Google Drive, OneDrive, SharePoint, GitHub, and Azure to browse and visualize cloud folders.
        </p>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRequireAuth}>
          <LogIn className="h-3.5 w-3.5" />
          Sign in to link accounts
        </Button>
      </div>
    );
  }

  return <CloudPanel onRequireAuth={handleRequireAuth} onBrowse={handleBrowse} />;
}

/* -------------------------------------------------------------------------- */
/*  Help tab                                                                  */
/* -------------------------------------------------------------------------- */

function HelpTab() {
  const setShortcutsOpen = useGraphStore((s) => s.setShortcutsOpen);
  const setBugReportOpen = useGraphStore((s) => s.setBugReportOpen);

  const handleRestartTutorial = () => {
    useGraphStore.getState().setSettingsOpen(false);
    useGraphStore.getState().resetTutorial();
    // Wait for the settings dialog's exit animation to finish so its overlay
    // doesn't keep capturing clicks on top of the tutorial.
    setTimeout(() => {
      window.dispatchEvent(new Event("fewer-restart-tutorial"));
    }, 200);
  };

  const learnActions = [
    { label: "Restart Interactive Tutorial", icon: RefreshCw, onClick: handleRestartTutorial },
    { label: "Blog", icon: Newspaper, onClick: () => window.open("/blog", "_blank", "noreferrer") },
    { label: "Documentation", icon: BookOpen, onClick: () => window.open("/docs", "_blank", "noreferrer") },
  ];

  const supportActions = [
    { label: "Keyboard Shortcuts", icon: Keyboard, onClick: () => setShortcutsOpen(true) },
    { label: "Report an Issue", icon: Bug, onClick: () => setBugReportOpen(true) },
    { label: "GitHub Issues", icon: HelpCircle, onClick: () => window.open("https://github.com/qvesera/fewer/issues", "_blank", "noreferrer") },
  ];

  const renderActions = (actions: typeof learnActions) => (
    <div className="flex flex-col gap-2">
      {actions.map((item, idx) => (
        <Button
          key={idx}
          variant="ghost"
          size="default"
          className="group justify-between h-11 px-3.5 rounded-xl border border-border/30 bg-card/20 hover:bg-accent/50 hover:border-border/60 text-xs font-normal text-foreground transition-[colors,transform,border-color] active:scale-[0.96]"
          onClick={item.onClick}
        >
          <div className="flex items-center gap-3">
            <item.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span>{item.label}</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5 py-1">
      <div className="space-y-2.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Learn
        </Label>
        {renderActions(learnActions)}
      </div>
      <div className="space-y-2.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Support
        </Label>
        {renderActions(supportActions)}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Settings dialog shell                                                     */
/* -------------------------------------------------------------------------- */

export function SettingsDialog() {
  const settingsOpen = useGraphStore((s) => s.settingsOpen);
  const setSettingsOpen = useGraphStore((s) => s.setSettingsOpen);
  const { user } = useAuth();
  const [tab, setTab] = useState("appearance");
  const listRef = useRef<HTMLDivElement>(null);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const isMobile = useIsMobile();
  // The Advanced tab is empty for signed-out mobile users: Layout Policy +
  // Node Metrics are sign-in gated and the Scroll to Zoom card is desktop-only.
  const showAdvancedTab = advancedModeEnabled || !isMobile;

  // Open straight to the Account (profile) tab when the share/gallery flow asks
  // the user to fill in their name + username before publishing to the gallery.
  useEffect(() => {
    const onOpenAccount = () => {
      setSettingsOpen(true);
      setTab("account");
    };
    window.addEventListener("fewer-open-settings-account", onOpenAccount);
    return () => window.removeEventListener("fewer-open-settings-account", onOpenAccount);
  }, []);

  // Keep the active tab visible: scroll it toward the center of the list so
  // selecting a tab near either end reveals its hidden neighbours.
  // Runs after commit so data-state is already updated.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [tab]);

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[520px] max-w-[calc(100%-2rem)] h-[590px] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 rounded-2xl border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="shrink-0 p-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
               <DialogTitle className="text-base font-semibold tracking-tight text-balance">Settings</DialogTitle>
               <DialogDescription className="text-xs text-muted-foreground/80 mt-0.5 text-pretty">
                Manage visual themes, graph metrics, and application preferences
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-3 pb-2 border-b border-border/30 bg-muted/10">
            <TabsList ref={listRef} className="w-full justify-start h-9 bg-transparent p-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger
                value="account"
                className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <User2 className="h-3.5 w-3.5" />
                Account
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
                About
              </TabsTrigger>
              <TabsTrigger
                value="appearance"
                className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <Palette className="h-3.5 w-3.5" />
                Appearance
              </TabsTrigger>
              {user && (
                <TabsTrigger
                  value="watched"
                  className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Watched
                </TabsTrigger>
              )}
              {user && (
                <TabsTrigger
                  value="cloud"
                  className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Cloud
                </TabsTrigger>
              )}
              {showAdvancedTab && (
                <TabsTrigger
                  value="advanced"
                  className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Advanced
                </TabsTrigger>
              )}
              <TabsTrigger
                value="help"
                className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Help
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="account" className="m-0">
              <AccountTab />
            </TabsContent>
            <TabsContent value="about" className="m-0">
              <AboutTab />
            </TabsContent>
            <TabsContent value="appearance" className="m-0">
              <AppearanceTab />
            </TabsContent>
            {user && (
              <TabsContent value="watched" className="m-0">
                <WatchedIndexesPanel />
              </TabsContent>
            )}
            {user && (
              <TabsContent value="cloud" className="m-0">
                <CloudTab />
              </TabsContent>
            )}
            {showAdvancedTab && (
              <TabsContent value="advanced" className="m-0">
                <AdvancedTab />
              </TabsContent>
            )}
            <TabsContent value="help" className="m-0">
              <HelpTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}