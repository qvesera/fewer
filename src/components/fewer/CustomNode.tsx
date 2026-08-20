"use client";

import { memo, useMemo, useRef, useState, useEffect, useCallback } from "react";
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
import { nodeAbsolutePath } from "@/lib/fewer/fileOps";
import { isGitHubUrl } from "@/lib/fewer/importFlow";

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
  const committedRef = useRef(false);
  // Latest value, readable from the outside-click listener without re-binding.
  const valueRef = useRef(initialValue);

  // Commit only when the user clicks outside the field. Blur alone is ignored —
  // it fires for unrelated reasons (the context menu closing / focus restore /
  // canvas re-renders), which previously auto-closed the editor right after
  // opening it. A genuine outside click always precedes blur, so we gate on it.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (committedRef.current) return;
      if (inputRef.current?.contains(e.target as Node)) return;
      committedRef.current = true;
      const v = valueRef.current;
      if (v === initialValue) {
        onCancel();
        return;
      }
      onCommit(v);
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [initialValue, onCancel, onCommit]);

  // Re-focus on every render (handles canvas re-renders losing focus)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
  });

  // Select text only on initial mount (not on every keystroke re-render)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => { setValue(e.target.value); valueRef.current = e.target.value; }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        (e.target as HTMLInputElement).select();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          committedRef.current = true;
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          committedRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        // No-op: committing is handled by the document outside-click listener.
        // Ignoring blur avoids a premature close when focus is restored elsewhere
        // (e.g. the context menu closing right after you open the rename field).
        if (committedRef.current) return;
      }}
      className="w-full rounded border border-cyan-400 bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none select-text"
    />
  );
}

/** Map a dataSource prefix to a display label for "Open in provider". */
function providerLabelFromSource(dataSource: string | null): string {
  if (!dataSource) return "Provider";
  if (dataSource.startsWith("cloud:github")) return "GitHub";
  if (dataSource.startsWith("cloud:google-drive")) return "Google Drive";
  if (dataSource.startsWith("cloud:onedrive")) return "OneDrive";
  if (dataSource.startsWith("cloud:sharepoint")) return "SharePoint";
  if (dataSource.startsWith("cloud:azure-devops")) return "Azure DevOps";
  if (dataSource.startsWith("cloud:azure-blob")) return "Azure Blob";
  // URL imports (GitHub repo or a public file index) carry real source URLs.
  if (dataSource.startsWith("url:")) {
    try {
      const u = new URL(dataSource.slice(4));
      if (u.hostname === "github.com") return "GitHub";
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "Site";
    }
  }
  return "Provider";
}

const openFolderInExplorer = async (path: string): Promise<boolean> => {
  // Prefer the exact, previously-resolved root location (saved with the graph
  // as localRootPath) so we don't search the filesystem again on every open.
  const st = useGraphStore.getState();
  const root = st.nodes.find((n) => n.data.isRoot);
  const sendPath =
    nodeAbsolutePath(path, root?.data.path, st.localRootPath) ?? path;
  try {
    const res = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: sendPath }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to open folder");
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // The path may come from an import (CSV/JSON/saved graph) and not exist on
    // this machine — that's not a crash. Log for diagnostics; callers surface a
    // toast so the user sees why nothing opened.
    console.error("Open folder error:", msg);
    return false;
  }
};

function FolderContextMenu({
  nodeId,
  nodeLabel,
  nodePath,
  nodeWebUrl,
  children,
}: {
  nodeId: string;
  nodeLabel: string;
  nodePath: string;
  nodeWebUrl?: string;
  children: React.ReactNode;
}) {
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const dataSource = useGraphStore((s) => s.dataSource);
  const localRootPath = useGraphStore((s) => s.localRootPath);
  const providerLabel = providerLabelFromSource(dataSource);
  const deleteNode = useGraphStore((s) => s.deleteNodes);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const clipboard = useGraphStore((s) => s.clipboard);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const duplicateNodeUnderParent = useGraphStore((s) => s.duplicateNodeUnderParent);
  const { toast } = useToast();
  const hasParent = edges.some((e) => e.target === nodeId);

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
        <ContextMenuItem
          onSelect={() => {
            const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
            if (childIds.length > 0) {
              useGraphStore.setState((s) => ({
                selectedNodeIds: childIds,
                nodes: s.nodes.map((n) => ({ ...n, selected: childIds.includes(n.id) })),
                graphVersion: s.graphVersion + 1,
              }));
              toast({ title: "Children selected", description: `${childIds.length} child${childIds.length === 1 ? "" : "ren"} selected` });
            } else {
              toast({ title: "No children", description: "This folder has no children" });
            }
          }}
          className="cursor-pointer"
        >
          Select Children
        </ContextMenuItem>
        <ContextMenuSeparator />
        {hasParent && (
          <ContextMenuItem
            onSelect={() => {
              useGraphStore.getState().removeEdgesFromHandle(nodeId, "target");
              toast({ title: "Unparented", description: nodeLabel });
            }}
            className="cursor-pointer"
          >
            Unparent
          </ContextMenuItem>
        )}
        {nodeWebUrl && (
          <ContextMenuItem
            onSelect={() => window.open(nodeWebUrl, "_blank", "noopener,noreferrer")}
            className="cursor-pointer"
          >
            Open in {providerLabel}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => {
            deleteNode([nodeId]);
            toast({ title: "Folder deleted", description: nodeLabel });
          }}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Delete
        </ContextMenuItem>
        {advancedModeEnabled && (
          <>
          <ContextMenuSeparator />
          {(() => {
            const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
            const hiddenIds = useGraphStore.getState().hiddenIds;
            const hasHidden = childIds.some((id) => hiddenIds.includes(id));
            if (hasHidden) {
              return (
                <ContextMenuItem
                  onSelect={() => {
                    const toShow = childIds.filter((id) => hiddenIds.includes(id));
                    if (toShow.length > 0) {
                      useGraphStore.setState((s) => ({
                        hiddenIds: s.hiddenIds.filter((id) => !toShow.includes(id)),
                      }));
                      useGraphStore.getState().relayout();
                      toast({ title: "Children shown", description: `${toShow.length} child${toShow.length === 1 ? "" : "ren"} restored` });
                    }
                    useGraphStore.getState().setZoomToNodeIds(childIds);
                  }}
                  className="cursor-pointer"
                >
                  Show Children
                </ContextMenuItem>
              );
            }
            return null;
          })()}
          {(() => {
            const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
            const hiddenIds = useGraphStore.getState().hiddenIds;
            const visibleChildren = childIds.filter((id) => !hiddenIds.includes(id));
            if (visibleChildren.length > 0) {
              return (
                <ContextMenuItem
                  onSelect={() => {
                    const hiddenSet = new Set(hiddenIds);
                    for (const id of visibleChildren) {
                      hiddenSet.add(id);
                    }
                    useGraphStore.setState({ hiddenIds: [...hiddenSet] });
                    useGraphStore.getState().relayout();
                    toast({ title: "Children hidden", description: `${visibleChildren.length} child${visibleChildren.length === 1 ? "" : "ren"} hidden` });
                  }}
                  className="cursor-pointer"
                >
                  Hide Children
                </ContextMenuItem>
              );
            }
            return null;
          })()}
          <ContextMenuItem
            onSelect={() => {
              // Select this folder so the Add Node dialog (Alt+N) adds a child of it.
              setSelectedNodeIds([nodeId]);
              useGraphStore.setState((s) => ({
                nodes: s.nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
              }));
              window.dispatchEvent(new CustomEvent("fewer-add-node"));
            }}
            className="cursor-pointer"
          >
            Add Child Node
          </ContextMenuItem>
          {(dataSource === "directory" || localRootPath) && (
            <ContextMenuItem
              onSelect={async () => {
                const ok = await openFolderInExplorer(nodePath);
                if (!ok) {
                  toast({
                    title: "Folder not found",
                    description: nodePath,
                    variant: "destructive",
                  });
                }
              }}
              className="cursor-pointer"
            >
              Open in File Explorer
            </ContextMenuItem>
          )}
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
            {dataSource === "directory" && (
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
            )}
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
  showOpenFile,
  nodeWebUrl,
  renameSource: menuRenameSource = "canvas",
  nodePath,
  children,
}: {
  nodeId: string;
  nodeLabel: string;
  onDelete: () => void;
  showOpenFile?: boolean;
  nodeWebUrl?: string;
  renameSource?: "canvas" | "folder";
  nodePath?: string;
  children: React.ReactNode;
}) {
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const dataSource = useGraphStore((s) => s.dataSource);
  const providerLabel = providerLabelFromSource(dataSource);
  // A file imported from a public file index (via crawl) — not a GitHub repo.
  // For these, "open" just downloads the raw file, so offer a Download action
  // instead of navigation. Folders and GitHub files keep "Open in <provider>".
  const isCrawledFile =
    !!dataSource && dataSource.startsWith("url:") && !isGitHubUrl(dataSource.slice(4));
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const clipboard = useGraphStore((s) => s.clipboard);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const duplicateNodeUnderParent = useGraphStore((s) => s.duplicateNodeUnderParent);
  const { toast } = useToast();
  const hasParent = edges.some((e) => e.target === nodeId);

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
        {hasParent && (
          <ContextMenuItem
            onSelect={() => {
              useGraphStore.getState().removeEdgesFromHandle(nodeId, "target");
              toast({ title: "Unparented", description: nodeLabel });
            }}
            className="cursor-pointer"
          >
            Unparent
          </ContextMenuItem>
        )}
        {nodeWebUrl && (
          isCrawledFile ? (
            <ContextMenuItem
              onSelect={async () => {
                const { downloadRemoteFile } = await import("@/lib/fewer/fileOps");
                const ok = await downloadRemoteFile(nodeWebUrl, nodeLabel);
                toast({
                  title: ok ? "Downloading" : "Could not download",
                  description: nodeLabel,
                  ...(ok ? {} : { variant: "destructive" }),
                });
              }}
              className="cursor-pointer"
            >
              Download
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              onSelect={() => window.open(nodeWebUrl, "_blank", "noopener,noreferrer")}
              className="cursor-pointer"
            >
              Open in {providerLabel}
            </ContextMenuItem>
          )
        )}
        <ContextMenuItem
          onSelect={() => {
            onDelete();
            toast({ title: "Item deleted", description: nodeLabel });
          }}
          className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10"
        >
          Delete Item
        </ContextMenuItem>
        {advancedModeEnabled && (
          <>
            <ContextMenuSeparator />
            {showOpenFile !== false && (
            <ContextMenuItem
              onSelect={async () => {
                const { openNodeFile } = await import("@/lib/fewer/fileOps");
                const ok = await openNodeFile({ id: nodeId, data: { type: "file", path: nodePath } }, dataSource);
                toast({
                  title: ok ? "Opening file" : "Cannot open file",
                  description: nodeLabel,
                  ...(ok ? {} : { variant: "destructive" }),
                });
              }}
              className="cursor-pointer"
            >
              Open File
            </ContextMenuItem>
              )}
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

const ITEM_HEIGHT = 28;
const OVERSCAN = 5;

function useVirtualScroll(containerRef: React.RefObject<HTMLDivElement | null>, totalItems: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [containerRef]);

  const totalHeight = totalItems * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  const visibleCount = endIndex - startIndex;
  const offsetY = startIndex * ITEM_HEIGHT;

  return { totalHeight, startIndex, endIndex, visibleCount, offsetY };
}

function ChildEntry({ child, parentId }: { child: FewerNode; parentId: string }) {
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const edges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const setZoomToNode = useGraphStore((s) => s.setZoomToNode);
  const dataSource = useGraphStore((s) => s.dataSource);
  const localRootPath = useGraphStore((s) => s.localRootPath);
  const renamingId = useGraphStore((s) => s.renamingId);
  const renameSource = useGraphStore((s) => s.renameSource);
  const renameNode = useGraphStore((s) => s.renameNode);
  const { toast } = useToast();
  const isDimmed = child.data.dimmed;
  const isHighlighted = child.data.highlighted;
  const isHidden = hiddenIds.includes(child.id);

  const handleRename = (v: string) => {
    const ok = renameNode(child.id, v);
    if (!ok) toast({ title: "Rename blocked", description: `"${v.trim()}" already exists in this folder.`, variant: "destructive" });
  };

  const folderChildCount = useMemo(() => {
    if (child.data.type !== "folder") return 0;
    return edges.filter((e) => e.source === child.id).length;
  }, [child.data.type, child.id, edges]);

  const childContent = (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 nodrag",
        "hover:bg-fewer-item-hover hover:pl-3",
        isHighlighted && "bg-amber-500/20 ring-1 ring-amber-400",
        isDimmed && "opacity-40",
        isHidden && "opacity-50 saturate-50",
      )}
      title={isHidden ? "Hidden from canvas — double-click the folder to zoom there" : undefined}
      onDoubleClick={() => {
        const isHidden = hiddenIds.includes(child.id);
        setZoomToNode(isHidden ? parentId : child.id);
      }}
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
      {renamingId === child.id && renameSource === "folder" ? (
        <RenameInput
          initialValue={child.data.extension ? `${child.data.label}.${child.data.extension}` : child.data.label}
          onCommit={handleRename}
          onCancel={() => useGraphStore.getState().setRenamingId(null)}
        />
      ) : (
        <span className="truncate text-fewer-text">{child.data.label}</span>
      )}
      <span className="ml-auto shrink-0 tabular-nums text-[10px] text-fewer-text-subtle">
        {child.data.type === "folder"
          ? `${folderChildCount} ${folderChildCount === 1 ? "item" : "items"}`
          : formatSize(child.data.size ?? 0)}
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-fewer-text-subtle/60" />
    </div>
  );

  if (child.data.type === "folder") {
    return (
      <FolderContextMenu
        nodeId={child.id}
        nodeLabel={child.data.label}
        nodePath={child.data.path}
        nodeWebUrl={child.data.webUrl}
      >
        {childContent}
      </FolderContextMenu>
    );
  }

  return (
    <FileEntryContextMenu
      nodeId={child.id}
      nodeLabel={child.data.label}
      onDelete={() => deleteNodes([child.id])}
      showOpenFile={dataSource === "directory" || !!localRootPath}
      nodePath={child.data.path}
      nodeWebUrl={child.data.webUrl}
    >
      {childContent}
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
  const renameSource = useGraphStore((s) => s.renameSource);
  const dataSource = useGraphStore((s) => s.dataSource);
  const localRootPath = useGraphStore((s) => s.localRootPath);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const renameNode = useGraphStore((s) => s.renameNode);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const { toast } = useToast();

  const hiddenIds = useGraphStore((s) => s.hiddenIds);

  const handleRename = (v: string) => {
    const ok = renameNode(id, v);
    if (!ok) toast({ title: "Rename blocked", description: `"${v.trim()}" already exists in this folder.`, variant: "destructive" });
  };

  const children = useMemo(() => {
    if (!isFolder) return [];
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    const list = allNodes.filter((n) => childIds.includes(n.id));
    list.sort((a, b) => {
      if (a.data.type !== b.data.type) {
        return a.data.type === "folder" ? -1 : 1;
      }
      return a.data.label.localeCompare(b.data.label);
    });
    return list;
  }, [edges, allNodes, id, isFolder]);

  const childCount = useMemo(() => {
    if (!isFolder) return 0;
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    return childIds.length;
  }, [edges, id, isFolder]);

  const hiddenChildCount = useMemo(() => {
    if (!isFolder) return 0;
    const hiddenSet = new Set(hiddenIds);
    const childIds = edges.filter((e) => e.source === id).map((e) => e.target);
    return childIds.filter((cid) => hiddenSet.has(cid)).length;
  }, [edges, id, isFolder, hiddenIds]);

  const isRenaming = renamingId === id;
  const childListRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualScroll(childListRef, children.length);

  // ---------- FOLDER CARD ----------
  if (isFolder) {
    const actualHeight = height ?? nodeHeight;
    const childListMaxHeight = Math.max(60, actualHeight - 72);
    return (
      <div
        className={cn(
          "group relative flex flex-col w-full h-full rounded-2xl border backdrop-blur-xl gm-node-hover",
          "bg-fewer-folder-bg border-fewer-folder-border text-fewer-text shadow-node-folder",
          data.isRoot && "gm-aurora gm-aurora-brand",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "gm-selected-ring",
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
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle"
        />

        <FolderContextMenu
          nodeId={id}
          nodeLabel={data.label}
          nodePath={data.path}
          nodeWebUrl={data.webUrl}
        >
          {/*
           * Wrap the entire card body in the folder context menu so right-clicking
           * anywhere on the folder (header, child list, or footer) opens it.
           * Child entries have their own nested context menus which take precedence.
           */}
          <div className="flex flex-col flex-1 min-h-0">
            <div
              className={cn(
                "flex items-center gap-2 rounded-t-xl border-b border-fewer-folder-border px-3 py-2",
                "bg-fewer-folder-bg",
              )}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fewer-folder-bg text-fewer-folder-icon"
              >
                <NodeIcon
                  type={data.type}
                  category={data.category}
                  isRoot={data.isRoot}
                  className="h-4 w-4"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                {isRenaming && renameSource === "canvas" ? (
                  <RenameInput
                    initialValue={data.extension ? `${data.label}.${data.extension}` : data.label}
                    onCommit={handleRename}
                    onCancel={() => useGraphStore.getState().setRenamingId(null)}
                  />
                ) : (
                  <span
                    className="truncate text-sm font-semibold text-fewer-folder-text"
                    title={data.label}
                  >
                    {data.label}
                  </span>
                )}
                <span
                  className="truncate text-[10px] text-fewer-folder-subtle-text"
                  title={data.path}
                >
                  {data.path}
                </span>
              </div>
            </div>

            <div
              ref={childListRef}
              className="overflow-y-auto p-1.5 nowheel flex-1 min-h-0"
              style={{ maxHeight: `${childListMaxHeight}px` }}
              onWheel={(e) => { e.stopPropagation(); }}
            >
              {children.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-fewer-text-subtle">
                  Empty folder
                </div>
              ) : (
                <div
                  style={{ height: `${virtual.totalHeight}px`, position: "relative" }}
                >
                  <div
                    style={{ transform: `translateY(${virtual.offsetY}px)` }}
                  >
                    {children.slice(virtual.startIndex, virtual.endIndex).map((child) => (
                      <ChildEntry key={child.id} child={child} parentId={id} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between rounded-b-xl border-t border-fewer-folder-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-fewer-folder-subtle-text bg-fewer-folder-bg"
            >
              <span>
                {childCount} {childCount === 1 ? "item" : "items"}
              </span>
              {hiddenChildCount > 0 && (
                <span className="rounded bg-fewer-folder-subtle-text/15 px-1 py-px text-[9px] text-fewer-folder-subtle-text">
                  {hiddenChildCount} hidden
                </span>
              )}
            </div>
          </div>
        </FolderContextMenu>

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
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle"
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
      showOpenFile={dataSource === "directory" || !!localRootPath}
      nodePath={data.path}
      nodeWebUrl={data.webUrl}
    >
      <div
        className={cn(
          "group relative flex items-center gap-3 w-full rounded-xl border backdrop-blur-xl gm-node-hover",
          "cursor-context-menu",
          "bg-fewer-file-bg border-fewer-file-border text-fewer-file-text shadow-node-file",
          data.highlighted && "ring-2 ring-amber-400",
          data.dimmed && "opacity-40 saturate-50",
          selected && "gm-selected-ring",
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
          className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle"
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
          {isRenaming && renameSource === "canvas" ? (
            <RenameInput
              initialValue={data.extension ? `${data.label}.${data.extension}` : data.label}
              onCommit={handleRename}
              onCancel={() => useGraphStore.getState().setRenamingId(null)}
            />
          ) : (
            <span
              className="truncate text-sm font-semibold text-fewer-file-text"
              title={data.label}
            >
              {data.label}
            </span>
          )}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fewer-file-subtle-text">
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
          className="!hidden !h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle"
        />
      </div>
    </FileEntryContextMenu>
  );
}

export const CustomNode = memo(CustomNodeImpl);
export { RenameInput };
export { openFolderInExplorer };
