"use client";

// In-app file preview (T-091 / #303): images + PDF + text for local files in
// the desktop shell. Falls back to the OS opener when the file is unsupported
// or over its size cap. Gated behind the localPreview pro feature.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, FileQuestion } from "lucide-react";
import { usePreviewStore } from "@/lib/fewer/previewStore";
import { previewCapFor, previewKindFor, imageMimeFor } from "@/lib/fewer/previewKind";
import { nativeFsReadBytes } from "@/lib/fewer/nativeShell";
import { openNodeFile } from "@/lib/fewer/folderSync";
import { useGraphStore } from "@/store/graphStore";
import { can } from "@/lib/fewer/tiers";

export function PreviewPanel() {
  const { target, closePreview } = usePreviewStore();
  const tier = useGraphStore((s) => s.tier);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const licensed = can("localPreview", tier);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setObjectUrl(null);
    setText(null);
    setError(null);
    if (!target) return;
    if (!licensed) return;

    const kind = previewKindFor(target.name);
    if (kind === "none") return;

    setLoading(true);
    (async () => {
      try {
        const buf = await nativeFsReadBytes(target.path, previewCapFor(kind));
        if (cancelled) return;
        if (kind === "text") {
          setText(new TextDecoder().decode(new Uint8Array(buf)));
        } else {
          url = URL.createObjectURL(
            new Blob([buf], { type: kind === "pdf" ? "application/pdf" : imageMimeFor(target.name) }),
          );
          setObjectUrl(url);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not read file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [target, licensed]);

  const openInOs = async () => {
    if (!target) return;
    await openNodeFile({ id: target.nodeId, data: { type: "file", path: target.path } }, "directory");
    closePreview();
  };

  const kind = target ? previewKindFor(target.name) : "none";

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) closePreview(); }}>
      <DialogContent dialogTitle="Preview" className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">{target?.name}</DialogTitle>
          <DialogDescription className="truncate text-xs" title={target?.path}>
            {target?.path}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[200px] flex-1 overflow-auto flex items-center justify-center">
          {!licensed ? (
            <p className="text-sm text-muted-foreground text-center px-4">
              File preview is a Pro feature. Activate a Fewer license in Settings → License.
            </p>
          ) : loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : error ? (
            <p className="text-sm text-destructive text-center px-4">{error}</p>
          ) : kind === "image" && objectUrl ? (
            <img src={objectUrl} alt={target?.name ?? ""} className="max-w-full max-h-[65vh] object-contain" />
          ) : kind === "pdf" && objectUrl ? (
            <object data={objectUrl} type="application/pdf" className="w-full h-[65vh]">
              <p className="text-sm text-muted-foreground p-4">
                PDF preview unavailable in this webview — use “Open” to view it in your system app.
              </p>
            </object>
          ) : kind === "text" && text !== null ? (
            <pre className="w-full h-[65vh] overflow-auto text-xs bg-muted/30 rounded-md p-3 whitespace-pre-wrap break-words">
              {text}
            </pre>
          ) : (
            <div className="text-center space-y-2 px-4">
              <FileQuestion className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No in-app preview for this file type.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-2" onClick={openInOs}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open in system app
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
