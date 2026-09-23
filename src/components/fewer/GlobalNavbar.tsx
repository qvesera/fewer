"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Bell, Settings, LogIn, LogOut, Filter, Check, X, ChevronRight, FolderOpen, CreditCard, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { useBilling } from "@/hooks/use-billing";
import { useEffect, useMemo, useRef } from "react";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, userDisplayName, initialsOf } from "@/hooks/use-profile";
import { getBrowserSupabase } from "@/lib/supabase";
import { computeStats } from "@/lib/fewer/stats";
import { CATEGORY_META, FILE_CATEGORIES } from "@/lib/fewer/categoryMeta";
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
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const categoryFilter = useGraphStore((s) => s.categoryFilter);
  const toggleCategoryFilter = useGraphStore((s) => s.toggleCategoryFilter);
  const clearCategoryFilter = useGraphStore((s) => s.clearCategoryFilter);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const stats = useMemo(() => computeStats(nodes, edges), [nodes, edges]);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const handleSignOut = async () => {
    try {
      await getBrowserSupabase().auth.signOut();
      toast({ title: "Signed out" });
    } catch {
      toast({ title: "Could not sign out", variant: "destructive" });
    }
  };


  return (
    <div className="relative w-full flex items-center justify-between gap-4 border-b border-border/40 bg-background/95 px-4 py-2.5">
      {/* Brand Group — clickable, goes to the homepage */}
      <Link href={process.env.NEXT_PUBLIC_HOME_URL || "/"} className="z-10 flex items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Fewer home">
        <Logo showText />
      </Link>

      {/* Global Search Center Input Box */}
      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md hidden sm:block z-20">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/80" />
        <input
          ref={inputRef}
          type="text"
          data-search-input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search directory cards..."
          className="w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-10 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/60 focus:bg-background transition-all"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              inputRef.current?.blur();
              setOpen(false);
            }
          }}
        />
        {/* Filter by file type */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Filter by file type"
                aria-label="Filter by file type"
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                  categoryFilter.length > 0 ? "text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs font-medium">Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-64 overflow-y-auto">
                {FILE_CATEGORIES.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const Icon = meta.icon;
                  const active = categoryFilter.includes(cat);
                  const count = stats.byCategory[cat] ?? 0;
                  return (
                    <DropdownMenuItem
                      key={cat}
                      onClick={() => toggleCategoryFilter(cat)}
                      className="flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
                        <span className={cn("truncate", active && "font-semibold text-primary")}>{meta.label}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                        {count}
                        {active && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => clearCategoryFilter()}
                disabled={categoryFilter.length === 0}
                className="text-xs cursor-pointer"
              >
                <X className="mr-2 h-3.5 w-3.5" /> Clear filter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

        {!loading && !user && (
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

        {!loading && user && (
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