"use client";

import { Button } from "@/components/ui/button";
import { Search, Bug, HelpCircle, Keyboard, LayoutTemplate, Globe, Github } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useEffect, useRef } from "react";

interface GlobalNavbarProps {
  onRestartTutorial?: () => void;
}

export function GlobalNavbar({ onRestartTutorial }: GlobalNavbarProps) {
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const setBugReportOpen = useGraphStore((s) => s.setBugReportOpen);
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);


  return (
    <div className="w-full flex items-center justify-between gap-4 border-b border-border/40 bg-background/95 px-4 py-2.5">
      {/* Brand Group */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm">
          <LayoutTemplate className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold tracking-tight">fewer</span>
      </div>

      {/* Global Search Center Input Box */}
     <div className="flex-1 max-w-md relative hidden sm:block">
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
      <div className="flex items-center gap-1">
       <Button
           variant="ghost"
           size="icon"
           className="h-8 w-8 sm:hidden text-muted-foreground"
           onClick={() => setSearchOpen(true)}
           aria-label="Open search"
         >
           <Search className="h-4 w-4" />
         </Button>

        {onRestartTutorial && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-orange-400 hover:bg-orange-500/10 hover:text-orange-500"
            onClick={onRestartTutorial}
            title="Restart tutorial"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => useGraphStore.getState().setShortcutsOpen(true)}
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/5"
          onClick={() => setBugReportOpen(true)}
          title="Report a bug"
        >
          <Bug className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.open("https://github.com/qvesera/fewer", "_blank", "noreferrer")}
          title="GitHub"
        >
          <Github className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => window.open("https://qvesera.github.io", "_blank", "noreferrer")}
          title="Website"
        >
          <Globe className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}