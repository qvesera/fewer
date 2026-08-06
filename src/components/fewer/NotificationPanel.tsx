"use client";

import { useToast } from "@/hooks/use-toast";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { history, clearHistory } = useToast();

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-4 top-14 z-50 w-80 max-h-[60vh] overflow-hidden rounded-2xl border border-border/40 bg-card/95 backdrop-blur-md shadow-xl flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notifications
          </span>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
                title="Clear history"
                aria-label="Clear notification history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
              title="Close"
              aria-label="Close notifications"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 gm-scroll">
          {history.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs transition-colors",
                    item.variant === "destructive"
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-muted/30 border border-border/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {item.title && (
                        <div className="font-semibold text-foreground truncate">
                          {typeof item.title === "string" ? item.title : item.title}
                        </div>
                      )}
                      {item.description && (
                        <div className="text-muted-foreground mt-0.5">
                          {typeof item.description === "string"
                            ? item.description
                            : item.description}
                        </div>
                      )}
                    </div>
                    {(item as any).timestamp && (
                      <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
                        {formatTime((item as any).timestamp)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}