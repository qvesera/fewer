"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useAuth } from "@/hooks/use-auth";
import { useReactFlow } from "@xyflow/react";
import { useToast } from "@/hooks/use-toast";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";
import {
  buildKeyboardRules,
  handleKeyboardShortcut,
  toStoreReader,
  type ShortcutCtx,
} from "@/lib/fewer/keyboardShortcuts";
import { openNodeFile, openFolderInExplorer } from "@/lib/fewer/fileOps";

/**
 * Global keyboard shortcuts handler. Mounted at the app root.
 * Delegates all logic to the pure rule table in keyboardShortcuts.ts.
 */
export function KeyboardShortcuts() {
  const reactFlow = useReactFlow();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const getStore = () => useGraphStore.getState();

    const ctx: ShortcutCtx = {
      getState: () => toStoreReader(getStore()),
      undo: getStore().undo,
      redo: getStore().redo,
      setSearchOpen: getStore().setSearchOpen,
      setDirection: getStore().setDirection,
      setSelectedNodeIds: getStore().setSelectedNodeIds,
      deleteNodes: getStore().deleteNodes,
      setRenamingId: getStore().setRenamingId,
      setClipboard: getStore().setClipboard,
      clearClipboard: getStore().clearClipboard,
      setFocusedNodeId: getStore().setFocusedNodeId,
      hideNodes: getStore().hideNodes,
      showAll: getStore().showAll,
      setShowFiles: getStore().setShowFiles,
      setExportOpen: getStore().setExportOpen,
      setShortcutsOpen: getStore().setShortcutsOpen,
      reset: getStore().reset,
      pasteFromClipboard: getStore().pasteFromClipboard,
      moveNode: getStore().moveNode,
      connectNodes: getStore().connectNodes,
      removeEdgesFromHandle: getStore().removeEdgesFromHandle,
      deleteEdges: getStore().deleteEdges,
      duplicateNodeUnderParent: getStore().duplicateNodeUnderParent,
      setAuthOpen: getStore().setAuthOpen,
      relayout: getStore().relayout,
      reactFlow,
      toast,
      user,
      localFs: LOCAL_FS_FEATURES,
      openNodeFile,
      openFolderInExplorer,
    };

    const rules = buildKeyboardRules();
    const handler = (e: KeyboardEvent) => {
      handleKeyboardShortcut(e, rules, ctx);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reactFlow, toast, user]);

  return null;
}