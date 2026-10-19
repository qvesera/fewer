"use client";

import { FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGraphStore } from "@/store/graphStore";
import { isHost } from "@/lib/fewer/nativeShell";
import { recentFolders } from "@/lib/fewer/recentFolders";

/**
 * "Recent Folders" list (T-199) — the shell's one-click reopen of a directory
 * root. Rendered in the sidebar's File & Actions section and on the empty
 * canvas; web builds render nothing. A folder that has since disappeared is
 * dropped from the list by `openRecentFolder` when the open fails.
 */
export function RecentFolders() {
  const { toast } = useToast();
  if (!isHost()) return null;
  const folders = recentFolders();
  if (!folders.length) return null;

  const open = async (path: string) => {
    const store = useGraphStore.getState();
    store.setLoading(true);
    try {
      const { openRecentFolder } = await import("@/lib/fewer/openRecentFolder");
      const result = await openRecentFolder(path);
      toast({
        title: result.title,
        description: result.ok ? result.description : result.error,
        variant: result.ok ? "default" : "destructive",
      });
    } finally {
      useGraphStore.getState().setLoading(false);
    }
  };

  return (
    <div className="pt-1 border-t border-border/20 w-full min-w-0" data-recent-folders>
      <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Recent Folders
      </div>
      {folders.map((f) => (
        <button
          key={f.path}
          onClick={() => void open(f.path)}
          title={f.path}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground nodrag"
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{f.name}</span>
        </button>
      ))}
    </div>
  );
}