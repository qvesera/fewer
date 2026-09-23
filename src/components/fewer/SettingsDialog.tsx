"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useActiveLeaf } from "@/hooks/use-active-leaf";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogHeader,
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
  CreditCard,
  Mail,
  Spline,
  SlidersHorizontal,
} from "lucide-react";
import type { ThemeMode, EdgeStyle, EdgeStrokeStyle } from "@/lib/fewer/types";
import type { SortKey, SortDir } from "@/lib/fewer/sorting";
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
import { limitsFor, formatUsage } from "@/lib/fewer/plans";
import { useAuth } from "@/hooks/use-auth";
import { useBilling } from "@/hooks/use-billing";
import { getBrowserSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { errMessage, isValidEmail } from "@/lib/fewer/authValidation";
import {
  classifyAccountDelete,
  minimapBounds,
  normalizeProfileResponse,
  profileIsDirty,
  runProfileSave,
  strokeStyleOptions,
  themeModeOptions,
  usageMeter,
  validateProfileFields,
  visibleTabs,
  type ProfileFields,
  type SettingsTabId,
} from "@/lib/fewer/settingsModel";
import type { LucideIcon } from "lucide-react";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

/** Tab-strip metadata; the id list itself comes from visibleTabs() in settingsModel. */
const TAB_META: Record<SettingsTabId, { label: string; Icon: LucideIcon }> = {
  account: { label: "Account", Icon: User2 },
  about: { label: "About", Icon: Info },
  appearance: { label: "Appearance", Icon: Palette },
  watched: { label: "Watched", Icon: BellRing },
  cloud: { label: "Cloud", Icon: Cloud },
  advanced: { label: "Advanced", Icon: Settings },
  help: { label: "Help", Icon: BookOpen },
};

/* -------------------------------------------------------------------------- */
/*  About tab                                                                 */
/* -------------------------------------------------------------------------- */

function AccountTab() {
  const { user, loading } = useAuth();
  const tier = useGraphStore((s) => s.tier);
  const { toast } = useToast();
  const { loading: billingBusy, startCheckout, openPortal } = useBilling();
  const BILLING_UI = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "team">("free");
  const [usage, setUsage] = useState<{ savedGraphs: number; watchedIndexes: number } | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  // Last values persisted for this user — used to detect unsaved changes.
  const [savedProfile, setSavedProfile] = useState({
    first_name: "",
    last_name: "",
    username: "",
  });
  // Derived after the state declarations: plan is a hook state above.
  const billingEnabledUi = BILLING_UI;
  const planLabel =
    plan === "pro" ? "Pro plan" : plan === "team" ? "Team plan" : "Free plan";
  const limits = limitsFor(plan);
  const savedMeter = usage === null ? null : usageMeter(usage.savedGraphs, limits.savedGraphs);
  const watchedMeter = usage === null ? null : usageMeter(usage.watchedIndexes, limits.watchedIndexes);

  // Load the stored profile for the signed-in user, if any.
  useEffect(() => {
    if (tier === "guest") {
      setPlan("free");
      setUsage(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        const normalized = normalizeProfileResponse(json);
        if (mounted && normalized) {
          setFirstName(normalized.first_name);
          setLastName(normalized.last_name);
          setUsername(normalized.username);
          setPlan(normalized.plan);
          setUsage(normalized.usage);
          setSavedProfile({
            first_name: normalized.first_name,
            last_name: normalized.last_name,
            username: normalized.username,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const profileUnchanged = !profileIsDirty({ firstName, lastName, username }, savedProfile);

  // Fetch the live profile from the server; used to re-sync state after a
  // failed save. Returns null on network failure — the caller keeps its
  // current state then.
  const fetchProfile = async (): Promise<ProfileFields | null> => {
    try {
      const res = await fetch("/api/profile");
      return normalizeProfileResponse(await res.json());
    } catch {
      return null;
    }
  };

  const handleSaveProfile = async () => {
    if (saving) return;

    // Fast synchronous guard — fires the toast immediately so tests/assertions
    // that check synchronously after the click don't miss it.  runProfileSave
    // re-validates internally for defence-in-depth.
    const validation = validateProfileFields({ firstName, lastName, username });
    if (!validation.ok) {
      toast({ title: "Could not save profile", description: validation.message!, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const result = await runProfileSave({
        fields: { firstName, lastName, username },
        savedProfile,
        fetchProfile,
      });
      toast(result.toast);
      if (result.kind === "saved") {
        setUsername(result.body.username);
        setSavedProfile(result.body);
      } else if (result.kind === "no_changes" || result.kind === "reverted") {
        setSavedProfile(result.savedProfile);
      }
    } catch (err) {
      const msg = errMessage(err, "Could not save profile");
      toast({ title: "Could not save profile", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBilling = async (action: () => Promise<boolean>) => {
    try {
      await action(); // navigates away to Stripe on success
    } catch (err) {
      const msg = errMessage(err, "Billing is unavailable");
      toast({ title: "Could not open billing", description: msg, variant: "destructive" });
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

  const handleChangeEmail = async () => {
    const value = newEmail.trim();
    if (!isValidEmail(value)) {
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    if (user && value.toLowerCase() === user.email?.toLowerCase()) {
      toast({ title: "Already your email", description: "Enter a different address." });
      return;
    }
    setChangingEmail(true);
    try {
      // Supabase emails a confirmation link to the NEW address; the email
      // (and login) only changes after the link is confirmed.
      const { error } = await getBrowserSupabase().auth.updateUser({ email: value });
      if (error) throw error;
      toast({
        title: "Check your inbox",
        description: `We sent a confirmation link to ${value}. Your email changes after you confirm it.`,
      });
      setNewEmail("");
    } catch (err) {
      const msg = errMessage(err, "Could not change email");
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setChangingEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON body — treated as an empty payload */
      }
      const outcome = classifyAccountDelete(res, data);
      toast(outcome.toast);
      if (outcome.kind === "error") return;

      // Sign out locally so the UI reflects the deleted session immediately.
      try {
        await getBrowserSupabase().auth.signOut();
      } catch {
        /* session may already be gone */
      }
      useGraphStore.getState().setSettingsOpen(false);
      setConfirmOpen(false);
    } catch (err) {
      const msg = errMessage(err, "Could not delete account");
      toast({ title: "Could not delete account", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 py-1">
      {/* Profile Card — only shown to signed-in users */}
      {!loading && tier !== "guest" && (
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

      {/* Account status card — only shown to signed-in users */}
      {!loading && user && (
        <div className="rounded-2xl border border-border/50 bg-card/40 p-3.5 space-y-3">
          {/* Row 1: plan badge + billing action */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">
                  {planLabel}
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  {billingEnabledUi && plan !== "free"
                    ? "Update card, view invoices, or cancel anytime"
                    : "Tier limits apply to saved graphs, history, watches, and sharing"}
                </span>
              </div>
            </div>
            {billingEnabledUi ? (
              <Button
                variant={plan !== "free" ? "outline" : "default"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={billingBusy}
                onClick={() => handleBilling(plan !== "free" ? openPortal : startCheckout)}
              >
                {billingBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {plan !== "free" ? "Manage subscription" : "Upgrade to Pro"}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground/70">
                {plan === "team"
                  ? "Team is managed by your organization."
                  : plan === "pro"
                    ? "Pro is enabled for this account."
                    : "Self-serve upgrades are currently off."}
              </span>
            )}
          </div>

          {/* Row 2: usage meters + account-level status */}
          <div className="border-t border-border/40 pt-3 space-y-2.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground/80">Saved graphs</span>
                <span className="font-medium text-foreground/80">
                  {usage === null ? "…" : formatUsage(usage.savedGraphs, limits.savedGraphs)}
                </span>
              </div>
              {savedMeter?.visible && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      savedMeter.over ? "bg-destructive" : "bg-primary/70",
                    )}
                    style={{ width: `${savedMeter.pct}%` }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground/80">Watched indexes</span>
                <span className="font-medium text-foreground/80">
                  {usage === null ? "…" : formatUsage(usage.watchedIndexes, limits.watchedIndexes)}
                </span>
              </div>
              {watchedMeter?.visible && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      watchedMeter.over ? "bg-destructive" : "bg-primary/70",
                    )}
                    style={{ width: `${watchedMeter.pct}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/80">Version history</span>
              <span className="font-medium text-foreground/80">
                {limits.historyDays > 0 ? `${limits.historyDays}-day history` : "Not available"}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground/80">Email</span>
              <span className="font-medium text-foreground/80 flex items-center gap-1">
                {user.email ?? "—"}
                {user.email_confirmed_at ? (
                  <span className="text-emerald-600 dark:text-emerald-400">✓ Verified</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Not verified</span>
                )}
              </span>
            </div>

            {user.created_at && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground/80">Member since</span>
                <span className="font-medium text-foreground/80">
                  {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              </div>
            )}
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
      {/* Change Email — only shown to signed-in users */}
      {!loading && user && (
        <div className="rounded-2xl border border-border/50 bg-card/40 p-3.5 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Mail className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">Change Email</span>
              <span className="text-[11px] text-muted-foreground/70">
                Current: {user.email ?? "—"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              id="account-new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new-you@example.com"
              autoComplete="email"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              disabled={changingEmail || newEmail.trim().length === 0}
              onClick={handleChangeEmail}
            >
              {changingEmail && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Change
            </Button>
          </div>
        </div>
      )}


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
                Schedules permanent removal in 7 days — sign in again to cancel
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
                  Your account is scheduled for permanent deletion in 7 days. Your saved graphs,
                  watch lists, cloud connections, and any shared graphs you own are removed then.
                  Signing in again before that cancels the deletion.
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
  const activeLeaf = useActiveLeaf();
  const themeModeGlobal = useGraphStore((s) => s.themeMode);
  const setThemeMode = useGraphStore((s) => s.setThemeMode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const edgeStyleGlobal = useGraphStore((s) => s.edgeStyle);
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

  const sortKey = useGraphStore((s) => s.sortKey);
  const sortDir = useGraphStore((s) => s.sortDir);
  const setSortKey = useGraphStore((s) => s.setSortKey);
  const setSortDir = useGraphStore((s) => s.setSortDir);


  const edgeStyleOptions = useMemo(() => [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ], []);

  const strokeOptions = useMemo(() => strokeStyleOptions(edgeAnimated), [edgeAnimated]);

  return (
    <div className="flex flex-col gap-5 py-1">
      <div className="space-y-2.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Theme Preferences
        </Label>
        <div className="grid grid-cols-3 gap-2.5">
          {themeModeOptions(advancedModeEnabled).map((mode) => {
            const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
            const active = themeModeGlobal === mode;
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
            Connection Styling
          </Label>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Style</Label>
            <SlidingToggle
              options={edgeStyleOptions}
              value={activeLeaf?.resolved.edgeStyle ?? edgeStyleGlobal}
              onValueChange={(v) => { if (activeLeaf) useGraphStore.getState().updateViewSettings(activeLeaf.leafId, { edgeStyle: v as EdgeStyle }); else setEdgeStyle(v as EdgeStyle); }}
            />
          </div>

          {advancedModeEnabled && (
            <div className="flex flex-col gap-4 border-t border-border/30 pt-4">
              {(activeLeaf?.resolved.edgeStyle ?? edgeStyleGlobal) === "angled" && (
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
                  options={strokeOptions}
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

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground/70" />
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sibling Sort
          </Label>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Order by</Label>
            <SlidingToggle
              options={[
                { value: "name" as const, label: "Name" },
                { value: "size" as const, label: "Size" },
                { value: "type" as const, label: "Type" },
                { value: "tag" as const, label: "Tag" },
              ]}
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Direction</Label>
            <SlidingToggle
              options={[
                { value: "asc" as const, label: "Ascending" },
                { value: "desc" as const, label: "Descending" },
              ]}
              value={sortDir}
              onValueChange={(v) => setSortDir(v as SortDir)}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Controls how siblings are ordered within each folder. Sort keys
            apply recursively and re-layout the whole graph immediately — the new
            order is saved with your other preferences and remembered next time
            you open the app (it does not travel with a saved graph). Folder
            size uses the value recorded when the graph was imported; if a
            folder's size wasn't reported, it sorts last in ascending order.
          </p>
        </div>
      </div>

      {advancedModeEnabled && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-muted-foreground/70" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Connection Motion
            </Label>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Label
              className="text-xs font-medium text-foreground"
              htmlFor="edge-motion-selected-toggle"
            >
              Animate Selected Connections Only
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
                Selected Connection Pattern
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
              ? "Only the connections along the selected cards' path to the root animate — in the chosen dashed/dotted pattern. All other connections follow the Connection Styling controls above."
              : "Turn this on to animate just the selection path; every other connection follows the Connection Styling controls above."}
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
  const { maxX, maxY } = minimapBounds(canvasSize, miniMapSize);

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
  // happens on drag release (or when a custom value is typed). No auto-relayout
  // of shared positions: the main canvas picks the new intensity up on the next
  // explicit Organize, while per-view canvases that derive their own layout react
  // immediately (see the derived layout in GraphCanvas).
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
                <p className="text-[11px] text-muted-foreground/70">Hide cards deeper than this level.</p>
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
                <p className="text-[11px] text-muted-foreground/70">Extra spacing between sibling branches — wider gaps around larger, deeper branch clusters. 0 disables it, 1 is the usual spacing, and the response curves upward from there: 2 is clearly looser and 3 opens the tree right up, which is where the range is capped — 3 is as loose as the layout gets.</p>
              </div>
              <span className="text-xs font-mono tabular-nums text-foreground/80">
                <EditableNumber value={shynessPreview} onCommit={(v) => setShynessScale(v)} labelFn={(v) => `${v.toFixed(1)}×`} />
              </span>
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
            Max Depth and Auto-hide apply immediately. Crown Shyness re-runs the layout as soon as you release the slider (or commit a typed value). Changing it clears the current view's manual card positions, since those were spaced for the old intensity.
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
              ? "The mouse wheel zooms the canvas directly; hold Ctrl (⌘) and scroll to pan."
              : "The mouse wheel pans the canvas vertically; hold Ctrl (⌘) and scroll to zoom."}
          </p>
        </div>
      )}

      {advancedModeEnabled && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/30 pb-2.5">
            <Maximize2 className="h-3.5 w-3.5 text-primary" />
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Card Metrics
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
  const tier = useGraphStore((s) => s.tier);

  const handleBrowse = () => {
    useGraphStore.getState().setSettingsOpen(false);
    setTimeout(() => window.dispatchEvent(new Event("fewer-cloud-browse")), 200);
  };

  const handleRequireAuth = () => {
    useGraphStore.getState().setSettingsOpen(false);
    setTimeout(() => useGraphStore.getState().setAuthOpen(true), 150);
  };

  if (tier === "guest") {
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
  const tier = useGraphStore((s) => s.tier);
  const [tab, setTab] = useState("appearance");
  const listRef = useRef<HTMLDivElement>(null);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const isMobile = useIsMobile();
  // The Advanced tab is empty for non-Pro mobile users: Layout Policy +
  // Node Metrics are Pro-tier and the Scroll to Zoom card is desktop-only.
  const tabs = visibleTabs({ tier, isMobile, advancedMode: advancedModeEnabled });
  const showAdvancedTab = tabs.includes("advanced");

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
      <DialogContent dialogTitle="Settings" dialogIcon={<Settings className="h-3.5 w-3.5" />} className="w-[520px] max-w-[calc(100%-2rem)] h-[590px] max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 rounded-2xl border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
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
              {tabs.map((id) => {
                const { label, Icon } = TAB_META[id];
                return (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="gap-1.5 rounded-lg px-3 text-xs shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {tabs.map((id) => (
              <TabsContent key={id} value={id} className="m-0">
                {id === "account" && <AccountTab />}
                {id === "about" && <AboutTab />}
                {id === "appearance" && <AppearanceTab />}
                {id === "watched" && <WatchedIndexesPanel />}
                {id === "cloud" && <CloudTab />}
                {id === "advanced" && <AdvancedTab />}
                {id === "help" && <HelpTab />}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}