"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Bell, Settings, LogIn, LogOut, ChevronRight, FolderOpen, CreditCard, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { Logo } from "./Logo";
import { SearchField } from "./SearchField";
import { cloudFeature } from "@/lib/fewer/features";
import { isHost } from "@/lib/fewer/nativeShell";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, userDisplayName, initialsOf } from "@/hooks/use-profile";
import { getBrowserSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GlobalNavbarProps {
  onToggleNotifications?: () => void;
  onOpenAuth?: () => void;
}

export function GlobalNavbar({ onToggleNotifications, onOpenAuth }: GlobalNavbarProps) {
  const { history, unreadCount, clearUnread } = useToast();
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const setSettingsOpen = useGraphStore((s) => s.setSettingsOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const triggerSavedGraphsExpand = useGraphStore((s) => s.triggerSavedGraphsExpand);
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const profile = useProfile();
  const displayName = userDisplayName(profile, user);
  const initials = initialsOf(displayName || user?.email || "");
  const avatarUrl = user?.user_metadata?.avatar_url;
  const BILLING_UI = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
  const { loading: billingBusy, startCheckout, openPortal } = useBilling();

  const handleBilling = async (fn: () => Promise<boolean>) => {
    try { await fn(); } catch (err) {
      toast({ title: "Billing unavailable", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
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


  const inShell = isHost();

  return (
    <div className="relative w-full flex items-center justify-between gap-4 border-b border-border/40 bg-background/95 px-4 py-2.5">
      {/* Brand Group: links home on the web; inert in the standalone (T-099
          follow-up — clicking it must never navigate to the marketing pages). */}
      {inShell ? (
        <div className="z-10 flex items-center gap-2" aria-label="Fewer">
          <Logo showText />
        </div>
      ) : (
        <Link href={process.env.NEXT_PUBLIC_HOME_URL || "/"} className="z-10 flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Fewer home">
          <Logo showText />
        </Link>
      )}

      {/* Global Search Center Input Box (T-198: shared SearchField) */}
      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md hidden sm:block z-20">
        <SearchField className="w-full" />
      </div>

      {/* System Actions Utility Cluster */}
      <div className="z-10 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:hidden text-muted-foreground min-hit"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
          </Button>

        {onToggleNotifications && (
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-muted-foreground hover:text-foreground min-hit"
            onClick={() => { clearUnread(); onToggleNotifications(); }}
            title="Notifications"
            aria-label="Toggle notification history"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        )}

        {!loading && !user && cloudFeature("accounts") && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onOpenAuth}
            title="Sign in"
          >
            <LogIn className="mr-1.5 h-3.5 w-3.5" />
            Sign in
          </Button>
        )}

        {!loading && user && cloudFeature("accounts") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 pl-1 pr-2 text-muted-foreground hover:text-foreground min-hit"
                title="Account"
                aria-label="Account menu"
              >
                <Avatar className="h-6 w-6">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline max-w-[9rem] truncate text-xs font-medium">
                  {displayName || user.email}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1">
              {/* Identity row → Account settings */}
              <DropdownMenuItem
                data-testid="account-settings"
                onClick={() => window.dispatchEvent(new Event("fewer-open-settings-account"))}
                className="cursor-pointer gap-2.5 py-2"
              >
                <Avatar className="h-8 w-8">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                  <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-foreground">{displayName || user.email}</span>
                    {profile.plan === "pro" && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">Pro</span>
                    )}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground/70">{user.email}</span>
                </span>
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              </DropdownMenuItem>

              {BILLING_UI && (
                <DropdownMenuItem
                  onClick={() => handleBilling(profile.plan !== "free" ? openPortal : startCheckout)}
                  className="cursor-pointer gap-2 text-xs"
                  disabled={billingBusy}
                >
                  {billingBusy
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <CreditCard className="mr-2 h-3.5 w-3.5" />}
                  {profile.plan !== "free" ? "Manage subscription" : "Upgrade to Pro"}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={() => { setSidebarOpen(true); triggerSavedGraphsExpand(); }}
                className="cursor-pointer gap-2 text-xs"
              >
                <FolderOpen className="mr-2 h-3.5 w-3.5" />
                Your saved graphs
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground min-hit"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>

      </div>
    </div>
  );
}