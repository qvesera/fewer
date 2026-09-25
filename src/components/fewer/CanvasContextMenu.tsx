import type { ReactNode } from "react";
import { useGraphStore } from "@/store/graphStore";
import { groupBatchActions } from "@/lib/fewer/menuSections";
import { plural } from "@/lib/fewer/plural";
import { selectByTag } from "@/lib/fewer/batchSelect";
import type { FewerNode } from "@/lib/fewer/types";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import { can } from "@/lib/fewer/tiers";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type CanvasMenuPosition = { x: number; y: number };
type CanvasMenu = CanvasMenuPosition & { kind: "pane" | "edge" | "selection" };

/**
 * Props for the canvas context menu — replaces the original 9 positional params.
 */
interface CanvasContextMenuProps {
  menu: CanvasMenu;
  lastClickedEdgeId: string | null;
  vs: ResolvedViewSettings;
  leafId: string | undefined;
  canvasAddChildEnabled: boolean;
  hiddenCount: number;
  allNodes: FewerNode[];
  selectAll: () => void;
  close: () => void;
}

/**
 * Context-menu renderer for the 3 menu kinds: edge, selection (multi-node),
 * and pane (background). Moved out of CanvasInner so the component body
 * stays declarative. Reads live store state via getState() — no hooks.
 */
export function CanvasContextMenu({
  menu,
  lastClickedEdgeId,
  vs,
  leafId,
  canvasAddChildEnabled,
  hiddenCount,
  allNodes,
  selectAll,
  close,
}: CanvasContextMenuProps): ReactNode {
  const { toast } = useToast();

  // ── Edge right-click: minimal menu ──
  if (menu.kind === "edge" && lastClickedEdgeId) {
    const eid = lastClickedEdgeId;
    return (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={close}
          onContextMenu={(e) => { e.preventDefault(); close(); }}
        />
        <div
          className="gm-float fixed z-50 min-w-[160px] rounded-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => {
              useGraphStore.getState().deleteEdges([eid]);
              toast({ title: "Connection deleted", description: "1 connection removed" });
              close();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98]"
          >
            Delete Connection
          </button>
        </div>
      </>
    );
  }

  const ids = useGraphStore.getState().selectedNodeIds;
  const isSelectionMenu = menu.kind === "selection" && ids.length >= 2;

  if (isSelectionMenu) {
    const { top, more, select, delete: del } = groupBatchActions({
      toast: (t) => toast(t as any),
      selectedIds: ids,
    });
    return (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={close}
          onContextMenu={(e) => { e.preventDefault(); close(); }}
        />
        <DropdownMenu open onOpenChange={(o) => { if (!o) close(); }}>
          <DropdownMenuTrigger asChild>
            <div
              className="fixed z-50 h-px w-px"
              style={{ left: menu.x, top: menu.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="gm-float min-w-[200px] animate-in fade-in zoom-in-95 duration-150">
            <DropdownMenuLabel>
              {ids.length} items selected
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {top.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onSelect={() => { a.run(); close(); }}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
            {more.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>More Actions</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {more.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onSelect={() => { a.run(); close(); }}
                    >
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Select</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {select.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onSelect={() => { a.run(); close(); }}
                  >
                    {a.label}
                  </DropdownMenuItem>
                ))}
                {can("tags", useGraphStore.getState().tier) && (() => {
                  const store = useGraphStore.getState();
                  const allTags = store.tags;
                  return (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>By Tag</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        {allTags.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            No tags yet
                          </div>
                        ) : allTags.map((tag) => (
                          <DropdownMenuItem
                            key={tag.id}
                            onSelect={() => {
                              selectByTag(allNodes, tag.id);
                              toast({ title: "Selected by tag", description: `${plural(selectByTag(allNodes, tag.id).length, "card")} tagged "${tag.label}"` });
                              close();
                            }}
                          >
                            <span
                              className="inline-block h-2 w-2 rounded-full mr-1.5"
                              style={{ background: tag.color }}
                            />
                            {tag.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                })()}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {del && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => { del.run(); close(); }}
                  className="text-destructive focus:bg-red-500/10"
                >
                  {del.label}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  // ── Pane right-click ──
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={close}
        onContextMenu={(e) => { e.preventDefault(); close(); }}
      />
      <div
        className="gm-float fixed z-50 min-w-[200px] rounded-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
        style={{ left: menu.x, top: menu.y }}
      >
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          View
        </div>
        <div className="my-1 h-px bg-border/40" />
        {leafId && (
          <>
            <button
              onClick={() => {
                useGraphStore.getState().toggleMinimapForLeaf(leafId);
                close();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]"
            >
              {vs.minimapHidden ? "Show Minimap" : "Hide Minimap"}
            </button>
            <button
              onClick={() => {
                useGraphStore.getState().setFilesBulkForLeaf(leafId, vs.showFiles);
                close();
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]"
            >
              {vs.showFiles ? "Hide Files" : "Show Files"}
            </button>
          </>
        )}
        <div className="my-1 h-px bg-border/40" />
        <button
          onClick={() => { selectAll(); close(); }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]"
        >
          Select All
        </button>
        <button
          onClick={() => {
            useGraphStore.getState().organizeAll();
            toast({ title: "Graph organized" });
            close();
          }}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]"
        >
          Organize
        </button>
        {canvasAddChildEnabled && (
          <>
            <button
              onClick={() => {
                const clip = useGraphStore.getState().clipboard;
                if (clip && clip.nodeIds.length > 0) {
                  useGraphStore.getState().setPastePosition(useGraphStore.getState().mousePosition);
                  useGraphStore.getState().pasteFromClipboard();
                  toast({
                    title: "Pasted",
                    description: `${plural(clip.nodeIds.length, "item")} pasted`,
                  });
                }
                close();
              }}
              disabled={!useGraphStore.getState().clipboard}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Paste
            </button>
            <button
              onClick={() => {
                if (leafId) useGraphStore.getState().revealAllForLeaf(leafId);
                else useGraphStore.getState().showAll();
                toast({
                  title: "Unhid all cards",
                  description: `${plural(hiddenCount, "card")} restored`,
                });
                close();
              }}
              disabled={hiddenCount === 0}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Show All
            </button>
          </>
        )}
        <div className="my-1 h-px bg-border/40" />
        <button
          onClick={() => {
            useGraphStore.getState().reset();
            toast({
              title: "Canvas cleared",
              description: `${plural(allNodes.length, "card")} removed`,
            });
            close();
          }}
          disabled={allNodes.length === 0}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear Canvas
        </button>
      </div>
    </>
  );
}
