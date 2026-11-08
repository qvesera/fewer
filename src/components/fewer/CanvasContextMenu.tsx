import type { ReactNode } from "react";
import { useGraphStore } from "@/store/graphStore";
import { groupBatchActions } from "@/lib/fewer/menuSections";
import { plural } from "@/lib/fewer/plural";
import { selectByTag } from "@/lib/fewer/batchSelect";
import { canvasMenuHeader, edgeMenuHeader, selectionCounts, selectionMenuHeader } from "@/lib/fewer/menuInfo";
import { menuShortcutHint, tryMenuShortcutHint } from "@/lib/fewer/keyboardShortcuts";
import { isMac } from "@/lib/fewer/platform";
import { TagMenu } from "./TagMenu";
import { MenuHeader } from "./MenuChrome";
import type { FewerNode } from "@/lib/fewer/types";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import { can } from "@/lib/fewer/tiers";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
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

/** Keyboard hint for a batch action id — nothing at all when it has no binding. */
function DropdownHint({ id, mod }: { id: string; mod: string }) {
  const hint = tryMenuShortcutHint(id, mod);
  if (!hint) return null;
  return <DropdownMenuShortcut aria-hidden="true">{hint}</DropdownMenuShortcut>;
}

/**
 * The canvas menus are opened from the pointer position rather than from a
 * persistent trigger, so the Radix trigger is a 1px marker parked at the click —
 * the content then anchors itself to it (flip/shift included for free).
 *
 * All three kinds share this shell and the same chrome as the card menus
 * (`MenuHeader`, `MenuInfoRows`), so an edge, the background and a card can no
 * longer look like three different products. They also inherit Radix's keyboard
 * navigation, which the hand-rolled divs these replaced never had.
 */
function PositionedMenu({
  menu,
  close,
  children,
}: {
  menu: CanvasMenuPosition;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <DropdownMenu open onOpenChange={(o) => { if (!o) close(); }}>
        <DropdownMenuTrigger asChild>
          <div className="fixed z-50 h-px w-px" style={{ left: menu.x, top: menu.y }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[220px] animate-in fade-in zoom-in-95 duration-150">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
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
  const mod = isMac() ? "⌘" : "Ctrl";
  // ── Edge right-click ──
  // No `Del` hint on "Delete Connection": the Delete rule only acts on RF-
  // SELECTED edges, and a right-click does not select an edge (measured: 0
  // selected, and Delete with this menu open removes nothing). Advertises what
  // the key does — not what the item does — so the two stay honest.
  if (menu.kind === "edge" && lastClickedEdgeId) {
    const eid = lastClickedEdgeId;
    const edge = useGraphStore.getState().edges.find((e) => e.id === eid);
    // Reveal + centre an endpoint. An edge can only paint while both ends are in
    // the graph, so no visibility fix-up is needed here.
    const goTo = (nodeId: string) => {
      useGraphStore.getState().setSelectedNodeIds([nodeId]);
      useGraphStore.getState().setZoomToNode(nodeId);
      close();
    };
    return (
      <PositionedMenu menu={menu} close={close}>
        <MenuHeader header={edge ? edgeMenuHeader(edge, allNodes) : { title: "Connection" }} />
        <DropdownMenuSeparator />
        {edge && allNodes.some((n) => n.id === edge.source) && (
          <DropdownMenuItem onSelect={() => goTo(edge.source)}>Go to Parent</DropdownMenuItem>
        )}
        {edge && allNodes.some((n) => n.id === edge.target) && (
          <DropdownMenuItem onSelect={() => goTo(edge.target)}>Go to Child</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            useGraphStore.getState().deleteEdges([eid]);
            toast({ title: "Connection deleted", description: "1 connection removed" });
            close();
          }}
          className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
        >
          Delete Connection
        </DropdownMenuItem>
      </PositionedMenu>
    );
  }

  const ids = useGraphStore.getState().selectedNodeIds;
  const isSelectionMenu = menu.kind === "selection" && ids.length >= 2;

  if (isSelectionMenu) {
    const { edit, structure, visibility, select, delete: del } = groupBatchActions({
      toast: (t) => toast(t as any),
      selectedIds: ids,
    });
    return (
      <PositionedMenu menu={menu} close={close}>
        <MenuHeader header={selectionMenuHeader(selectionCounts(allNodes, ids))} />
        <DropdownMenuSeparator />
        {/* Edit — the data operations. */}
        {edit.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() => { a.run(); close(); }}
          >
            {a.label}
            <DropdownHint id={a.id} mod={mod} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* Structure — reparenting + grouping, promoted out of the old
            "More Actions" drawer. Group ships here and in the node context
            menus' batch section identically (web and shell). */}
        {structure.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() => { a.run(); close(); }}
          >
            {a.label}
            <DropdownHint id={a.id} mod={mod} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* View / Meta — the same submenu row as the card menus. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Visibility</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {visibility.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onSelect={() => { a.run(); close(); }}
              >
                {a.label}
                <DropdownHint id={a.id} mod={mod} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {can("tags", useGraphStore.getState().tier) && <TagMenu ids={ids} />}
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
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
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
        <DropdownMenuSeparator />
        {del && (
          <DropdownMenuItem
            onSelect={() => { del.run(); close(); }}
            className="text-destructive focus:bg-red-500/10"
          >
            {del.label}
            <DropdownHint id={del.id} mod={mod} />
          </DropdownMenuItem>
        )}
      </PositionedMenu>
    );
  }

  // ── Pane right-click ──
  return (
    <PositionedMenu menu={menu} close={close}>
      <MenuHeader header={canvasMenuHeader({ nodeCount: allNodes.length, hiddenCount })} />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => { selectAll(); close(); }}>
        Select All
        <DropdownMenuShortcut aria-hidden="true">{menuShortcutHint("selectAll", mod)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          useGraphStore.getState().organizeAll();
          toast({ title: "Graph organized" });
          close();
        }}
      >
        Organize
        <DropdownMenuShortcut aria-hidden="true">{menuShortcutHint("organize", mod)}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {canvasAddChildEnabled && (
        <>
          <DropdownMenuItem
            disabled={!useGraphStore.getState().clipboard}
            onSelect={() => {
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
          >
            Paste
            <DropdownMenuShortcut aria-hidden="true">{menuShortcutHint("paste", mod)}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={hiddenCount === 0}
            onSelect={() => {
              if (leafId) useGraphStore.getState().revealAllForLeaf(leafId);
              else useGraphStore.getState().showAll();
              toast({
                title: "Unhid all cards",
                description: `${plural(hiddenCount, "card")} restored`,
              });
              close();
            }}
          >
            Show All
            <DropdownMenuShortcut aria-hidden="true">{menuShortcutHint("showAll", mod)}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </>
      )}
      {leafId && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              useGraphStore.getState().setFilesBulkForLeaf(leafId, vs.showFiles);
              close();
            }}
          >
            {vs.showFiles ? "Hide Files" : "Show Files"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              useGraphStore.getState().toggleMinimapForLeaf(leafId);
              close();
            }}
          >
            {vs.minimapHidden ? "Show Minimap" : "Hide Minimap"}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={allNodes.length === 0}
        onSelect={() => {
          useGraphStore.getState().reset();
          toast({
            title: "Canvas cleared",
            description: `${plural(allNodes.length, "card")} removed`,
          });
          close();
        }}
        className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
      >
        Clear Canvas
        <DropdownMenuShortcut aria-hidden="true">{menuShortcutHint("clearCanvas", mod)}</DropdownMenuShortcut>
      </DropdownMenuItem>
    </PositionedMenu>
  );
}
