"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useConnections, connectProvider, unlinkConnection, AVAILABLE_PROVIDERS, PROVIDER_LABELS } from "@/hooks/use-cloud";
import { Cloud, Github, Loader2, Trash2, ExternalLink, Sparkles } from "lucide-react";
import type { CloudProvider } from "@/lib/fewer/cloud/types";

interface CloudPanelProps {
  onRequireAuth: () => void;
  onBrowse: () => void;
}

export function CloudPanel({ onRequireAuth, onBrowse }: CloudPanelProps) {
  const { toast } = useToast();
  const { connections, loading, refresh } = useConnections();
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const handleConnect = async (provider: CloudProvider) => {
    try {
      connectProvider(provider);
    } catch {
      onRequireAuth();
    }
  };

  const handleUnlink = async (id: string) => {
    setUnlinking(id);
    const ok = await unlinkConnection(id);
    if (ok) {
      toast({ title: "Account unlinked", description: "Connection removed." });
      refresh();
    } else {
      toast({ title: "Could not unlink", variant: "destructive" });
    }
    setUnlinking(null);
  };

  const linked = new Set(connections.map((c) => c.provider));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Cloud</p>
        {connections.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] text-muted-foreground" onClick={onBrowse}>
            <ExternalLink className="h-3 w-3" /> Browse
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-1.5">
          {AVAILABLE_PROVIDERS.map((provider) => {
            const isLinked = linked.has(provider);
            const conns = connections.filter((c) => c.provider === provider);
            return (
              <div key={provider} className="rounded-xl border border-border/40 bg-muted/10">
                <div className="flex items-center gap-2 p-2.5">
                  <Cloud className="h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{PROVIDER_LABELS[provider]}</p>
                    {isLinked ? (
                      <p className="truncate text-[10px] text-muted-foreground">{conns.map((c) => c.account_name).join(", ")}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Not linked</p>
                    )}
                  </div>
                  {isLinked ? (
                    <div className="flex items-center gap-1">
                      {conns.map((c) => (
                        <Button
                          key={c.id}
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-400"
                          onClick={() => handleUnlink(c.id)}
                          disabled={unlinking === c.id}
                          title="Unlink"
                        >
                          {unlinking === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => handleConnect(provider)}>
                      <Github className="h-3 w-3" /> Link
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Placeholder for planned providers */}
          <div className="rounded-xl border border-dashed border-border/40 bg-transparent p-2.5 text-[10px] text-muted-foreground/70">
            Coming soon: Google Drive, OneDrive, SharePoint, Azure DevOps, Azure Blob, public links.
          </div>
        </div>
      )}
    </div>
  );
}