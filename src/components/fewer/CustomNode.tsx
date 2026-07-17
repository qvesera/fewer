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
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const deleteNode = useGraphStore((s) => s.deleteNodes);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const clipboard = useGraphStore((s) => s.clipboard);
  const addNode = useGraphStore((s) => s.addNode);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const duplicateNodeUnderParent = useGraphStore((s) => s.duplicateNodeUnderParent);
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
              useGraphStore.getState().moveNode(nodeId);
              toast({ title: "Cut", description: nodeLabel });
            }
          }}
          className="cursor-pointer"
        >
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            duplicateNodeUnderParent(nodeId);
            toast({ title: "Duplicated", description: nodeLabel });
          }}
          className="cursor-pointer"
        >
          Duplicate
        </ContextMenuItem>
        {clipboard && clipboard.nodeIds.length > 0 && (
          <ContextMenuItem
            onSelect={() => {
              const selected = useGraphStore.getState().selectedNodeIds;
              const ns = useGraphStore.getState().nodes;
              const parentId = selected.length === 1
                ? ns.find((n) => n.id === selected[0] && n.data.type === "folder")?.id
                : undefined;
              useGraphStore.getState().pasteFromClipboard(parentId);
              toast({
                title: "Pasted",
                description: `${clipboard.nodeIds.length} item${clipboard.nodeIds.length === 1 ? "" : "s"} pasted${parentId ? " into folder" : ""}`,
              });
            }}
            className="cursor-pointer"
          >
            Paste
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => deleteNode([nodeId])}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Delete
        </ContextMenuItem>
        {advancedModeEnabled && (
          <>
            <ContextMenuSeparator />
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
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

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
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const clipboard = useGraphStore((s) => s.clipboard);
  const nodes = useGraphStore((s) => s.nodes);
  const duplicateNodeUnderParent = useGraphStore((s) => s.duplicateNodeUnderParent);
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
              useGraphStore.getState().moveNode(nodeId);
              toast({ title: "Cut", description: nodeLabel });
            }
          }}
          className="cursor-pointer"
        >
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            duplicateNodeUnderParent(nodeId);
            toast({ title: "Duplicated", description: nodeLabel });
          }}
          className="cursor-pointer"
        >
          Duplicate
        </ContextMenuItem>
        {clipboard && clipboard.nodeIds.length > 0 && (
          <ContextMenuItem
            onSelect={() => {
              const selected = useGraphStore.getState().selectedNodeIds;
              const ns = useGraphStore.getState().nodes;
              const parentId = selected.length === 1
                ? ns.find((n) => n.id === selected[0] && n.data.type === "folder")?.id
                : undefined;
              useGraphStore.getState().pasteFromClipboard(parentId);
              toast({
                title: "Pasted",
                description: `${clipboard.nodeIds.length} item${clipboard.nodeIds.length === 1 ? "" : "s"} pasted${parentId ? " into folder" : ""}`,
              });
            }}
            className="cursor-pointer"
          >
            Paste
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={onDelete}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Delete Item
        </ContextMenuItem>
        {advancedModeEnabled && (
          <>
            <ContextMenuSeparator />
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
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ChildEntry({ child }: { child: FewerNode }) {
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const edges = useGraphStore((s) => s.edges);
  const isDimmed = child.data.dimmed;
  const isHighlighted = child.data.highlighted;

  const folderChildCount = useMemo(() => {
    if (child.data.type !== "folder") return 0;
    return edges.filter((e) => e.source === child.id).length;
  }, [child.data.type, child.id, edges]);

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
        <NodeIcon
          type={child.data.type}
          category={child.data.category}
          isRoot={child.data.isRoot}
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            child.data.type === "folder"
              ? "text-fewer-folder-icon"
              : "text-fewer-file-icon",
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

function CustomNodeImpl({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<FewerNode>) {
  const layoutDirection = useGraphStore((s) => s.direction);
  const { source, target } = getHandlePositions(layoutDirection);
  const isFolder = data.type === "folder";

  const edges = useGraphStore((s) => s.edges);
  const allNodes = useGraphStore((s) => s.nodes);
  const renamingId = useGraphStore((s) => s.renamingId);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const renameNode = useGraphStore((s) => s.renameNode);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);

  const children = useMemo(() => {
    if (!isFolder) return [];
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    return allNodes
      .filter((n) => childIds.includes(n.id))
      .slice(0, 20);
  }, [edges, allNodes, id, isFolder]);

  const childCount = useMemo(() => {
    if (!isFolder) return 0;
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    return childIds.length;
  }, [edges, id, isFolder]);

  const isRenaming = renamingId === id;

  // ---------- FOLDER CARD ----------
  if (isFolder) {
    const actualHeight = height ?? nodeHeight;
    const childListMaxHeight = Math.max(60, actualHeight - 72);
    return (
      <div
        className={cn(
          "group relative flex flex-col w-full h-full rounded-2xl border backdrop-blur-xl gm-node-hover",
          "bg-fewer-folder-bg border-fewer-folder-border text-fewer-text shadow-node-folder",
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
            shouldResize={() => true}
            lineClassName="!border-cyan-400/70"
            handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
          />
        )}

        <Handle
          type="target"
          position={target}
          id={`target-${target}`}
          isConnectable
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              useGraphStore.getState().removeEdgesFromHandle(id, "target");
            }
          }}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <FolderContextMenu
          nodeId={id}
          nodeLabel={data.label}
          nodePath={data.path}
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-t-xl border-b border-fewer-folder-border px-3 py-2",
              "cursor-context-menu bg-fewer-folder-header-bg",
            )}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fewer-folder-header-bg text-fewer-folder-icon"
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

        <div
          className="overflow-y-auto p-1.5 nowheel flex-1 min-h-0"
          style={{ maxHeight: `${childListMaxHeight}px` }}
          onWheel={(e) => { e.stopPropagation(); }}
        >
          {children.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Empty folder
            </div>
          ) : (
            <div className="space-y-0.5">
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

        <div
          className="rounded-b-xl border-t border-fewer-folder-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-fewer-folder-header-text bg-fewer-folder-bg"
        >
          {childCount} {childCount === 1 ? "item" : "items"}
        </div>

        <Handle
          type="source"
          position={source}
          id={`source-${source}`}
          isConnectable
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              useGraphStore.getState().removeEdgesFromHandle(id, "source");
            }
          }}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />
      </div>
    );
  }

  // ---------- FILE CARD ----------
  return (
    <FileEntryContextMenu
      nodeId={id}
      nodeLabel={data.label}
      onDelete={() => deleteNodes([id])}
    >
      <div
        className={cn(
          "group relative flex items-center gap-3 w-full rounded-xl border backdrop-blur-xl gm-node-hover",
          "cursor-context-menu",
          "bg-fewer-file-bg border-fewer-file-border text-fewer-text shadow-node-file",
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
          shouldResize={(e) => {
            const direction = (e as unknown as { direction: string }).direction;
            return direction === "left" || direction === "right";
          }}
          lineClassName="!border-cyan-400/70"
          handleClassName="!h-2 !w-2 !rounded-full !bg-cyan-400 !border-2 !border-white"
        />
      )}

        <Handle
          type="target"
          position={target}
          id={`target-${target}`}
          isConnectable
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              useGraphStore.getState().removeEdgesFromHandle(id, "target");
            }
          }}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fewer-file-icon"
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
          id={`source-${source}`}
          isConnectable
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              useGraphStore.getState().removeEdgesFromHandle(id, "source");
            }
          }}
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-slate-700"
        />
      </div>
    </FileEntryContextMenu>
  );
}

export const CustomNode = memo(CustomNodeImpl);