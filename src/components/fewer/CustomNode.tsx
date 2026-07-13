"use client";

import { memo, useMemo, useRef, useState, useEffect } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileImage,
  FileText,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  File as FileIcon,
  FileType,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import type { FewerNode, FileCategory } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";

/**
 * Module-level variable holding the FileSystemHandle of the folder being
 * dragged from a child entry. FileSystemHandle objects can't be serialized
 * via JSON dataTransfer, so we stash it here during dragStart and retrieve
 * it during drop.
 */
export let draggedFolderHandle: FileSystemHandle | null = null;

const CATEGORY_ICON: Record<
  FileCategory,
  React.ComponentType<{ className?: string }>
> = {
  code: FileCode,
  config: FileJson,
  image: FileImage,
  document: FileText,
  archive: FileArchive,
  data: FileSpreadsheet,
  media: FileVideo,
  binary: FileIcon,
  text: FileType,
};

function getHandlePositions(layoutDirection?: string): {
  source: Position;
  target: Position;
} {
  switch (layoutDirection) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
    default:
      return { source: Position.Bottom, target: Position.Top };
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Renders the correct Lucide icon for a node based on its type + category. */
function NodeIcon({
  type,
  category,
  isRoot,
  className,
}: {
  type: "folder" | "file";
  category?: FileCategory;
  isRoot?: boolean;
  className?: string;
}) {
  if (type === "folder") {
    const FolderComp = isRoot ? FolderOpen : Folder;
    return <FolderComp className={className} />;
  }
  const IconComp = CATEGORY_ICON[category ?? "text"] ?? FileIcon;
  return <IconComp className={className} />;
}

/* -------------------------------------------------------------------------- */
/*  Inline rename input                                                       */
/* -------------------------------------------------------------------------- */

function RenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // focus + select filename without extension
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
  }, [initialValue]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(value)}
      className="w-full rounded border border-cyan-400 bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Folder context menu                                                       */
/* -------------------------------------------------------------------------- */

function FolderContextMenu({
  nodeId,
  nodeLabel,
  nodePath,
  children,
}: {
  nodeId: string;
  nodeLabel: string;
  nodePath: string;
  children: React.ReactNode;
}) {
  const hideNode = useGraphStore((s) => s.hideNode);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const addNode = useGraphStore((s) => s.addNode);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const { toast } = useToast();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="text-xs text-muted-foreground">
          Folder actions
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => setRenamingId(nodeId)}
          className="cursor-pointer"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            addNode(nodeId, "New Folder", "folder");
            setSelectedNodeIds([]);
            toast({
              title: "Child node added",
              description: "New Folder added to " + nodeLabel,
            });
          }}
          className="cursor-pointer"
        >
          Add Child Node
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(nodePath);
              toast({ title: "Path copied", description: nodePath });
            } catch {
              toast({
                title: "Copy failed",
                description: "Clipboard not available",
                variant: "destructive",
              });
            }
          }}
          className="cursor-pointer"
        >
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() =>
            toast({
              title: "Refreshed from disk",
              description: `${nodeLabel} re-scanned`,
            })
          }
          className="cursor-pointer"
        >
          Refresh from Disk
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              setClipboard("copy", [nodeId]);
              toast({ title: "Copied", description: nodeLabel });
            }
          }}
          className="cursor-pointer"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              setClipboard("cut", [nodeId]);
              toast({ title: "Cut", description: nodeLabel });
            }
          }}
          className="cursor-pointer"
        >
          Cut
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => hideNode(nodeId)}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Hide Node
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*  File entry context menu                                                   */
/*  Used both for child entries inside a folder card AND standalone file      */
/*  nodes — both get the same Rename / Copy Name / Delete Item menu.          */
/* -------------------------------------------------------------------------- */

function FileEntryContextMenu({
  nodeId,
  nodeLabel,
  onDelete,
  children,
}: {
  nodeId: string;
  nodeLabel: string;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const nodes = useGraphStore((s) => s.nodes);
  const { toast } = useToast();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="text-xs text-muted-foreground">
          File actions
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => setRenamingId(nodeId)}
          className="cursor-pointer"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={async () => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node?.data.fsHandle) {
              try {
                const { openFile } = await import("@/lib/fewer/fileOps");
                await openFile(node.data.fsHandle as FileSystemFileHandle);
                toast({ title: "Opening file", description: nodeLabel });
              } catch {
                toast({ title: "Cannot open file", variant: "destructive" });
              }
            } else {
              toast({
                title: "No file handle",
                description: "File not loaded from disk",
                variant: "destructive",
              });
            }
          }}
          className="cursor-pointer"
        >
          Open File
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(nodeLabel);
              toast({ title: "Name copied", description: nodeLabel });
            } catch {
              toast({
                title: "Copy failed",
                description: "Clipboard not available",
                variant: "destructive",
              });
            }
          }}
          className="cursor-pointer"
        >
          Copy Name
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            setClipboard("copy", [nodeId]);
            toast({ title: "Copied", description: nodeLabel });
          }}
          className="cursor-pointer"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            setClipboard("cut", [nodeId]);
            toast({ title: "Cut", description: nodeLabel });
          }}
          className="cursor-pointer"
        >
          Cut
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={onDelete}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Delete Item
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*  Child entry row (inside a folder card)                                    */
/* -------------------------------------------------------------------------- */

function ChildEntry({ child }: { child: FewerNode }) {
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const edges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const isDimmed = child.data.dimmed;
  const isHighlighted = child.data.highlighted;

  // For folder children, compute their visible child count from edges.
  const folderChildCount = useMemo(() => {
    if (child.data.type !== "folder") return 0;
    const hidden = new Set(hiddenIds);
    return edges.filter((e) => e.source === child.id && !hidden.has(e.target))
      .length;
  }, [child.data.type, child.id, edges, hiddenIds]);

  return (
    <FileEntryContextMenu
      nodeId={child.id}
      nodeLabel={child.data.label}
      onDelete={() => deleteNodes([child.id])}
    >
      <div
        className={cn(
          "flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 nodrag",
          "hover:bg-foreground/8 hover:pl-3",
          isHighlighted && "bg-amber-500/20 ring-1 ring-amber-400",
          isDimmed && "opacity-40",
        )}
      >
        {/* Drag handle for folder entries — disabled for now, will re-enable later */}
        {/* {child.data.type === "folder" && (
          <span
            draggable
            onDragStart={(e) => {
              draggedFolderHandle = child.data.fsHandle ?? null;
              e.dataTransfer.setData(
                "application/fewer-child",
                JSON.stringify({
                  label: child.data.label,
                  type: child.data.type,
                  parentId: child.id,
                  parentPath: child.data.path,
                })
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="cursor-grab shrink-0 text-muted-foreground/40 hover:text-foreground active:cursor-grabbing nodrag"
            title="Drag to canvas to create a linked child node"
          >
            <GripVertical className="h-3 w-3" />
          </span>
        )} */}
        <NodeIcon
          type={child.data.type}
          category={child.data.category}
          isRoot={child.data.isRoot}
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            child.data.type === "folder"
              ? "text-[var(--fewer-folder-icon)]"
              : "text-[var(--fewer-file-icon)]",
          )}
        />
        <span className="truncate text-foreground/90">{child.data.label}</span>
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {child.data.type === "folder"
            ? `${folderChildCount} ${folderChildCount === 1 ? "item" : "items"}`
            : formatSize(child.data.size ?? 0)}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      </div>
    </FileEntryContextMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main CustomNode                                                           */
/* -------------------------------------------------------------------------- */

function CustomNodeImpl({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<FewerNode>) {
  const layoutDirection = (data.layoutDirection as string) ?? "TB";
  const { source, target } = getHandlePositions(layoutDirection);
  const isFolder = data.type === "folder";

  // Lookup children for folder display
  const edges = useGraphStore((s) => s.edges);
  const allNodes = useGraphStore((s) => s.nodes);
  const renamingId = useGraphStore((s) => s.renamingId);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const renameNode = useGraphStore((s) => s.renameNode);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);

  const children = useMemo(() => {
    if (!isFolder) return [];
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    const hidden = new Set(hiddenIds);
    return allNodes
      .filter((n) => childIds.includes(n.id) && !hidden.has(n.id))
      .slice(0, 20); // cap higher so taller nodes can show more
  }, [edges, allNodes, id, isFolder, hiddenIds]);

  const childCount = useMemo(() => {
    if (!isFolder) return 0;
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    const hidden = new Set(hiddenIds);
    return childIds.filter((cid) => !hidden.has(cid)).length;
  }, [edges, id, isFolder, hiddenIds]);

  const isRenaming = renamingId === id;

  // ---------- FOLDER CARD ----------
  if (isFolder) {
    const actualHeight = height ?? nodeHeight;
    const childListMaxHeight = Math.max(60, actualHeight - 72);
    return (
      <div
        style={{
          backgroundColor: "var(--fewer-folder-bg)",
          borderColor: "var(--fewer-folder-border)",
          color: "var(--fewer-text)",
        }}
        className={cn(
          "group relative flex flex-col w-full h-full rounded-xl border backdrop-blur-xl gm-node-hover",
          "shadow-[0_8px_24px_-8px_rgba(249,115,22,0.25)]",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "gm-selected-glow",
        )}
      >
        {selected && (
          <NodeResizer
            minWidth={180}
            minHeight={50}
            isVisible={!!selected}
            shouldResize={(e) => {
              // Allow all resize directions for folders
              return true;
            }}
            lineClassName="!border-cyan-400/70"
            handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
          />
        )}

        <Handle
          type="target"
          position={target}
          isConnectable
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <FolderContextMenu
          nodeId={id}
          nodeLabel={data.label}
          nodePath={data.path}
        >
          {/* Header — folder context menu trigger */}
          <div
            style={{
              backgroundColor: "var(--fewer-folder-header-bg)",
              borderBottomColor: "var(--fewer-folder-border)",
            }}
            className={cn(
              "flex items-center gap-2 rounded-t-xl border-b px-3 py-2",
              "cursor-context-menu",
            )}
          >
            <div
              style={{
                backgroundColor: "var(--fewer-folder-header-bg)",
                color: "var(--fewer-folder-icon)",
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            >
              <NodeIcon
                type={data.type}
                category={data.category}
                isRoot={data.isRoot}
                className="h-4 w-4"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {isRenaming ? (
                <RenameInput
                  initialValue={data.label}
                  onCommit={(v) => renameNode(id, v)}
                  onCancel={() => useGraphStore.getState().setRenamingId(null)}
                />
              ) : (
                <span
                  className="truncate text-sm font-semibold text-foreground"
                  title={data.label}
                >
                  {data.label}
                </span>
              )}
              <span
                className="truncate text-[10px] text-muted-foreground"
                title={data.path}
              >
                {data.path}
              </span>
            </div>
          </div>
        </FolderContextMenu>

        {/* Body — child entries (each with file context menu) */}
        {/* onWheel stopPropagation prevents React Flow from zooming the canvas
            when scrolling inside the folder's child list. The nowheel class
            alone isn't enough in React Flow v12. flex-1 makes this area grow
            to fill the available height set by the node's style.height. */}
        <div
          className="overflow-y-auto p-1.5 nowheel flex-1 min-h-0"
          style={{ maxHeight: `${childListMaxHeight}px` }}
          onWheel={(e) => {
            e.stopPropagation();
          }}
        >
          {children.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Empty folder
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Show more items when the node is taller */}
              {children
                .slice(0, Math.max(3, Math.floor(childListMaxHeight / 22)))
                .map((child) => (
                  <ChildEntry key={child.id} child={child} />
                ))}
              {childCount >
                Math.max(3, Math.floor(childListMaxHeight / 22)) && (
                <div className="px-2 py-1 text-center text-[10px] text-muted-foreground">
                  +{" "}
                  {childCount -
                    Math.max(3, Math.floor(childListMaxHeight / 22))}{" "}
                  more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            backgroundColor: "var(--fewer-folder-bg)",
            borderTopColor: "var(--fewer-folder-border)",
            color: "var(--fewer-folder-header-text)",
          }}
          className="rounded-b-xl border-t px-3 py-1.5 text-[10px] uppercase tracking-wider"
        >
          {childCount} {childCount === 1 ? "item" : "items"}
        </div>

        <Handle
          type="source"
          position={source}
          isConnectable
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />
      </div>
    );
  }

  // ---------- FILE CARD (standalone file node) ----------
  return (
    <FileEntryContextMenu
      nodeId={id}
      nodeLabel={data.label}
      onDelete={() => deleteNodes([id])}
    >
      <div
        style={{
          backgroundColor: "var(--fewer-file-bg)",
          borderColor: "var(--fewer-file-border)",
          color: "var(--fewer-text)",
        }}
        className={cn(
          "group relative flex items-center gap-3 w-full rounded-xl border backdrop-blur-xl gm-node-hover",
          "cursor-context-menu",
          "shadow-[0_8px_24px_-8px_rgba(168,85,247,0.25)]",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "gm-selected-glow",
        )}
      >
        {selected && (
          <NodeResizer
            minWidth={180}
            minHeight={58}
            isVisible={!!selected}
            // Files can only be resized horizontally — block vertical resize
            shouldResize={(e) => {
              const direction = (e as unknown as { direction: string })
                .direction;
              return direction === "left" || direction === "right";
            }}
            lineClassName="!border-cyan-400/70"
            handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
          />
        )}

        <Handle
          type="target"
          position={target}
          isConnectable
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <div
          style={{ color: "var(--fewer-file-icon)" }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        >
          <NodeIcon
            type={data.type}
            category={data.category}
            isRoot={data.isRoot}
            className="h-5 w-5"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {isRenaming ? (
            <RenameInput
              initialValue={data.label}
              onCommit={(v) => renameNode(id, v)}
              onCancel={() => useGraphStore.getState().setRenamingId(null)}
            />
          ) : (
            <span
              className="truncate text-sm font-semibold text-foreground"
              title={data.label}
            >
              {data.label}
            </span>
          )}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{data.extension ? `.${data.extension}` : "file"}</span>
            {data.size ? (
              <>
                <span className="opacity-50">·</span>
                <span>{formatSize(data.size)}</span>
              </>
            ) : null}
          </div>
        </div>

        <Handle
          type="source"
          position={source}
          isConnectable
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />
      </div>
    </FileEntryContextMenu>
  );
}

export const CustomNode = memo(CustomNodeImpl);
