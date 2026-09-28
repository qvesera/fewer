"use client";

import { ContextMenuItem } from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { useGraphStore } from "@/store/graphStore";
import { openFolderInExplorer } from "@/lib/fewer/fileOps";
import { nodeAbsolutePath } from "@/lib/fewer/filePaths";
import { symlinkTargetLabel } from "@/lib/fewer/symlinkDisplay";
import type { SymlinkInfo } from "@/lib/fewer/types";

/**
 * Context-menu items for symlink nodes (rendered inside the Info submenu).
 * Nothing is stored on the node beyond SymlinkInfo — the jump resolves the
 * target at click time by comparing each node's absolute disk path against the
 * link's resolved target.
 */
export function SymlinkMenuItems({ info }: { info: SymlinkInfo }) {
  const { toast } = useToast();
  const dataSource = useGraphStore((s) => s.dataSource);
  const localRootPath = useGraphStore((s) => s.localRootPath);
  const targetLabel = symlinkTargetLabel(info);

  const copyTarget = async () => {
    const text = info.resolvedPath ?? info.target;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Target path copied", description: text });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available", variant: "destructive" });
    }
  };

  // Select + center the target node, revealing it first when hidden. Only
  // meaningful for targets inside the imported tree.
  const goToTarget = () => {
    const state = useGraphStore.getState();
    const target = (info.resolvedPath ?? info.target).replace(/\\/g, "/");
    const rootPath = state.nodes.find((n) => n.data.isRoot)?.data.path;
    const found = state.nodes.find(
      (n) =>
        nodeAbsolutePath(n.data.path, rootPath, state.localRootPath ?? undefined)?.replace(/\\/g, "/") === target,
    );
    if (!found) {
      toast({
        title: "Target not in this graph",
        description: `${targetLabel} lies outside the imported tree.`,
        variant: "destructive",
      });
      return;
    }
    if (state.hiddenIds.includes(found.id)) state.showNode(found.id);
    state.setSelectedNodeIds([found.id]);
    state.setZoomToNode(found.id);
  };

  const openTarget = async () => {
    const ok = await openFolderInExplorer(info.resolvedPath ?? info.target);
    if (!ok) {
      toast({ title: "Target not found", description: info.resolvedPath ?? info.target, variant: "destructive" });
    }
  };

  return (
    <>
      <ContextMenuItem onSelect={copyTarget} className="cursor-pointer">
        Copy Target Path
      </ContextMenuItem>
      {info.insideTree && !info.broken && (
        <ContextMenuItem onSelect={goToTarget} className="cursor-pointer">
          Go to Target
        </ContextMenuItem>
      )}
      {!info.broken && !!info.resolvedPath && (dataSource === "directory" || localRootPath) && (
        <ContextMenuItem onSelect={openTarget} className="cursor-pointer">
          Open Target in File Explorer
        </ContextMenuItem>
      )}
    </>
  );
}