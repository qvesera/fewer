"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  encodeShareData,
  buildShareUrl,
  buildDbShareUrl,
  SHARE_HASH_THRESHOLD,
} from "@/lib/fewer/share";
import { Link, Copy, Check, Loader2 } from "lucide-react";

export function ShareDialog() {
  const open = useGraphStore((s) => s.shareOpen);
  const setOpen = useGraphStore((s) => s.setShareOpen);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const localRootPath = useGraphStore((s) => s.localRootPath);
  const { toast } = useToast();
  const { user } = useAuth();
  const isGuest = !user;

  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [building, setBuilding] = useState(false);

  // Build the share URL only when the user clicks "Generate link".
  // Small graphs embed the compressed hash in the URL; large graphs are
  // stored in Supabase and referenced by a short `#s:<id>`.
  const handleGenerate = async () => {
    if (nodes.length === 0) return;
    setBuilding(true);
    setShareUrl("");
    const data = {
      nodes,
      edges,
      localRootPath,
    };
    const encoded = encodeShareData(data);
    if (encoded.length <= SHARE_HASH_THRESHOLD) {
      setShareUrl(buildShareUrl(encoded));
      setBuilding(false);
      return;
    }
    // Guests and this graph are too big for the encoded hash — the DB short
    // link requires an account (guest cap is < 2,000 chars, see /docs/plans).
    if (isGuest) {
      setBuilding(false);
      toast({
        title: "Sign in to share this graph",
        description: "Signed-out sharing is limited to graphs under 2,000 characters of compressed data.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      const json = await res.json();
      if (json.id) {
        setShareUrl(buildDbShareUrl(json.id));
      } else {
        // Fall back to the (long) hash URL if DB store fails.
        setShareUrl(buildShareUrl(encoded));
      }
    } catch {
      setShareUrl(buildShareUrl(encoded));
    } finally {
      setBuilding(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link copied!",
        description: "Share this link with anyone to load this graph.",
      });
    } catch {
      toast({
        title: "Could not copy",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dialogTitle="Share" dialogIcon={<Link className="h-3.5 w-3.5 text-purple-500" />} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4 text-purple-500" />
            Share Graph
          </DialogTitle>
          <DialogDescription>
            Generate a link that encodes the current graph state. Anyone with the
            link can open this graph in their browser.
          </DialogDescription>
        </DialogHeader>

        {nodes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nothing to share: add nodes to your canvas first.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <Button
              className="w-full gap-1.5 cursor-pointer"
              onClick={handleGenerate}
              disabled={building}
            >
              {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
              Generate link
            </Button>

            {shareUrl && (
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="text-xs font-mono flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={building || !shareUrl}
                  className="gap-1.5 shrink-0 cursor-pointer"
                >
                  {building ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {building
                ? "Storing large graph for a short share link…"
                : `This link contains all ${nodes.length} node${ nodes.length === 1 ? "" : "s" } and ${edges.length} edge${ edges.length === 1 ? "" : "s" } with their positions.`}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="cursor-pointer"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}