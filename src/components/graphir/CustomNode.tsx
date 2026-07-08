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
} from "lucide-react";
import type { GraphirNode, FileCategory } from "@/lib/graphir/types";
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

function getHandlePositions(isHorizontal?: boolean) {
  if (isHorizontal) {
    return { source: Position.Right, target: Position.Left };
  }
  return { source: Position.Bottom, target: Position.Top };
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
  const { toast } = useToast();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
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

function ChildEntry({ child }: { child: GraphirNode }) {
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const edges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const isDimmed = child.data.dimmed;
  const isHighlighted = child.data.highlighted;

  // For folder children, compute their visible child count from edges.
  const folderChildCount = useMemo(() => {
    if (child.data.type !== "folder") return 0;
    const hidden = new Set(hiddenIds);
    return edges.filter(
      (e) => e.source === child.id && !hidden.has(e.target)
    ).length;
  }, [child.data.type, child.id, edges, hiddenIds]);

  return (
    <FileEntryContextMenu
      nodeId={child.id}
      nodeLabel={child.data.label}
      onDelete={() => deleteNodes([child.id])}
    >
      <div
        // Folders are draggable so they can be dropped onto the canvas to
        // create new standalone child nodes. Files are not draggable.
        draggable={child.data.type === "folder"}
        onDragStart={(e) => {
          if (child.data.type !== "folder") {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData(
            "application/graphir-child",
            JSON.stringify({
              label: child.data.label,
              type: child.data.type,
              parentId: child.id,
            })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className={cn(
          "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
          "hover:bg-foreground/10",
          child.data.type === "folder" && "cursor-grab active:cursor-grabbing",
          isHighlighted && "bg-amber-500/20 ring-1 ring-amber-400",
          isDimmed && "opacity-40"
        )}
      >
        <NodeIcon
          type={child.data.type}
          category={child.data.category}
          isRoot={child.data.isRoot}
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            child.data.type === "folder" ? "text-orange-300" : "text-purple-300"
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

function CustomNodeImpl({ id, data, selected }: NodeProps<GraphirNode>) {
  const isHorizontal = (data.isHorizontal as boolean) ?? false;
  const { source, target } = getHandlePositions(isHorizontal);
  const isFolder = data.type === "folder";

  // Lookup children for folder display
  const edges = useGraphStore((s) => s.edges);
  const allNodes = useGraphStore((s) => s.nodes);
  const renamingId = useGraphStore((s) => s.renamingId);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);

  const children = useMemo(() => {
    if (!isFolder) return [];
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    const hidden = new Set(hiddenIds);
    return allNodes
      .filter((n) => childIds.includes(n.id) && !hidden.has(n.id))
      .slice(0, 8); // cap to keep card compact
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
    return (
      <div
        className={cn(
          "group relative flex flex-col rounded-xl border backdrop-blur-xl transition-shadow",
          "w-[240px]",
          "border-orange-400/40 bg-orange-500/10 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.4)]",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background",
          "hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]"
        )}
      >
        {selected && (
          <NodeResizer
            minWidth={180}
            minHeight={50}
            isVisible={!!selected}
            lineClassName="!border-cyan-400/70"
            handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
          />
        )}

        <Handle
          type="target"
          position={target}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <FolderContextMenu nodeId={id} nodeLabel={data.label} nodePath={data.path}>
          {/* Header — folder context menu trigger */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-t-xl border-b border-orange-400/30 bg-orange-500/20 px-3 py-2",
              "cursor-context-menu"
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/30 text-orange-200">
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
              <span className="truncate text-[10px] text-muted-foreground" title={data.path}>
                {data.path}
              </span>
            </div>
          </div>
        </FolderContextMenu>

        {/* Body — child entries (each with file context menu) */}
        <div className="max-h-[180px] overflow-y-auto p-1.5">
          {children.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Empty folder
            </div>
          ) : (
            <div className="space-y-0.5">
              {children.map((child) => (
                <ChildEntry key={child.id} child={child} />
              ))}
              {childCount > 8 && (
                <div className="px-2 py-1 text-center text-[10px] text-muted-foreground">
                  + {childCount - 8} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rounded-b-xl border-t border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-orange-200/80">
          {childCount} {childCount === 1 ? "item" : "items"}
        </div>

        <Handle
          type="source"
          position={source}
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
        className={cn(
          "group relative flex items-center gap-3 rounded-xl border backdrop-blur-xl transition-shadow",
          "min-w-[200px] max-w-[240px] cursor-context-menu",
          "border-purple-400/40 bg-purple-500/15 shadow-[0_8px_24px_-8px_rgba(168,85,247,0.4)]",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background",
          "hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]"
        )}
      >
        {selected && (
          <NodeResizer
            minWidth={180}
            minHeight={50}
            isVisible={!!selected}
            lineClassName="!border-cyan-400/70"
            handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
          />
        )}

        <Handle
          type="target"
          position={target}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/30 text-purple-200">
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
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />
      </div>
    </FileEntryContextMenu>
  );
}

export const CustomNode = memo(CustomNodeImpl);
