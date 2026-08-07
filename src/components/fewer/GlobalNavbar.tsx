"use client";

import { Button } from "@/components/ui/button";
import { Search, Bell, Settings, LogIn, LogOut, User } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";
import { getBrowserSupabase } from "@/lib/supabase";
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
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, loading } = useAuth();
  const { toast } = useToast();

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
      {/* Brand Group */}
      <div className="z-10 flex items-center gap-2">
        <Logo showText />
      </div>

      {/* Global Search Center Input Box */}
      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md hidden sm:block z-20">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/80" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search directory nodes..."
          className="w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-12 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/60 focus:bg-background transition-all"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              inputRef.current?.blur();
              setOpen(false);
            }
          }}
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center rounded bg-muted-foreground/10 border border-border/40 px-1.5 font-mono text-[9px] text-muted-foreground pointer-events-none">
          ⌘F
        </kbd>
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
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground min-hit"
                title="Account"
                aria-label="Account menu"
              >
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-medium truncate">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-xs cursor-pointer">
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