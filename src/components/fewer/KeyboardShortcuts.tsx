"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useAuth } from "@/hooks/use-auth";
import { useReactFlow, type Connection } from "@xyflow/react";
import { navigate } from "@/lib/fewer/navigation";
import { openNodeFile } from "@/lib/fewer/fileOps";
import { useToast } from "@/hooks/use-toast";

/**
 * Global keyboard shortcuts handler. Mounted at the app root.
 *
 * Ctrl/Cmd+Z     - undo
 * Ctrl/Cmd+Shift+Z / Ctrl+Y - redo
 * Ctrl/Cmd+A     - select all
 * Ctrl/Cmd+F     - open search
 * Ctrl/Cmd+L     - cycle layout direction
 * Alt+N          - new node (child of selected folder, or standalone)
 * Alt+Shift+N    - clear canvas
 * Ctrl/Cmd+E     - open export panel
 * Ctrl/Cmd+C     - copy selected files
 * Ctrl/Cmd+X     - cut selected files
 * Ctrl/Cmd+V     - paste files into focused/selected folder
 * H              - hide selected nodes
 * Shift+H        - show all nodes
 * Delete         - delete selected nodes
 * F2             - rename selected node
 * Enter          - open selected file (or focus first child of folder)
 * Escape         - clear selection
 * Space          - fit view
 * +/- / 0        - zoom in / out / reset
 * Arrow keys     - navigate between nodes (tree-style)
 * Alt+R          - re-layout graph
 * Alt+F          - zoom to selection
 * Alt+I          - open import dialog (folder / file / URL / cloud)
 * Alt+O          - open in file explorer
 * Alt+S          - save current graph (logged-in users only)
 */
export function KeyboardShortcuts() {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const dataSource = useGraphStore((s) => s.dataSource);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const setClipboard = useGraphStore((s) => s.setClipboard);
  const clipboard = useGraphStore((s) => s.clipboard);
  const clearClipboard = useGraphStore((s) => s.clearClipboard);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);
  const focusedNodeId = useGraphStore((s) => s.focusedNodeId);
  const hideNodes = useGraphStore((s) => s.hideNodes);
  const showAll = useGraphStore((s) => s.showAll);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const setExportOpen = useGraphStore((s) => s.setExportOpen);
  const setShortcutsOpen = useGraphStore((s) => s.setShortcutsOpen);
  const reset = useGraphStore((s) => s.reset);
  const addNode = useGraphStore((s) => s.addNode);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const duplicateNodeUnderParent = useGraphStore((s) => s.duplicateNodeUnderParent);
  const pasteFromClipboard = useGraphStore((s) => s.pasteFromClipboard);
  const moveNode = useGraphStore((s) => s.moveNode);
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const removeEdgesFromHandle = useGraphStore((s) => s.removeEdgesFromHandle);
  const deleteEdges = useGraphStore((s) => s.deleteEdges);
  const { toast } = useToast();
  const { user } = useAuth();

  const reactFlow = useReactFlow();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+F
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Ctrl+L - cycle layout
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const order: ("TB" | "LR" | "BT" | "RL")[] = ["TB", "LR", "BT", "RL"];
        const next = order[(order.indexOf(direction) + 1) % order.length];
        setDirection(next);
        return;
      }

      // Alt+Shift+N - clear canvas
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (nodes.length > 0) {
          reset();
          toast({ title: "Canvas cleared" });
        }
        return;
      }

      // Alt+N - open Add Node dialog (child mode if folder selected, otherwise standalone)
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const hasFolderSelected = useGraphStore.getState().selectedNodeIds.length === 1 &&
          useGraphStore.getState().nodes.some((n) => n.id === useGraphStore.getState().selectedNodeIds[0] && n.data.type === "folder");
        window.dispatchEvent(new CustomEvent(hasFolderSelected ? "fewer-add-node" : "fewer-add-node-standalone"));
        return;
      }

      // Alt+R - relayout
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        const relayout = useGraphStore.getState().relayout;
        relayout();
        toast({ title: "Graph relayouted" });
        return;
      }

      // Alt+F - zoom to selection
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "f" && !inEditable) {
        e.preventDefault();
        const selected = nodes.filter((n) => selectedNodeIds.includes(n.id));
        if (selected.length > 0) {
          reactFlow.fitView({
            nodes: selected.map((n) => ({ id: n.id })),
            duration: 600,
            padding: 0.3,
          });
        } else {
          reactFlow.fitView({ duration: 600, padding: 0.2 });
        }
        return;
      }

      // Alt+I - open the unified import dialog (folder / file / URL / cloud)
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "i" && !inEditable) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("fewer-import-folder"));
        return;
      }

      // Alt+O - open selected folder in file explorer
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "o" && !inEditable) {
        e.preventDefault();
        const selected = useGraphStore.getState().selectedNodeIds;
        if (selected.length === 1) {
          const node = useGraphStore.getState().nodes.find((n) => n.id === selected[0]);
          if (node && node.data.type === "folder" && (useGraphStore.getState().dataSource === "directory" || useGraphStore.getState().localRootPath)) {
            // Import and call openFolderInExplorer dynamically
            import("./CustomNode").then(async ({ openFolderInExplorer }) => {
              const label = node.data.label;
              const ok = await openFolderInExplorer(node.data.path);
              toast({
                title: ok ? "Opening folder" : "Folder not found",
                description: label,
                ...(ok ? {} : { variant: "destructive" }),
              });
            });
          }
        }
        return;
      }

      // Alt+S - save current graph (logged-in users only). Opens the auth
      // dialog when signed out; otherwise triggers the save dialog.
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "s" && !inEditable) {
        e.preventDefault();
        if (!user) {
          useGraphStore.getState().setAuthOpen(true);
          return;
        }
        window.dispatchEvent(new CustomEvent("fewer-save-graph"));
        return;
      }

      // Alt+P - parent: last selected node is parent, rest are children
      if (e.altKey && !e.shiftKey && e.key.toLowerCase() === "p" && !inEditable) {
        e.preventDefault();
        const ids = useGraphStore.getState().selectedNodeIds;
        if (ids.length >= 2) {
          const lastNode = useGraphStore.getState().nodes.find((n) => n.id === ids[ids.length - 1]);
          if (lastNode?.data.type === "folder") {
            const parentId = ids[ids.length - 1];
            const childIds = ids.slice(0, -1);
            let okCount = 0;
            let failCount = 0;
            for (const childId of childIds) {
              const result = connectNodes({ source: parentId, target: childId } as Connection);
              if (result.ok) okCount++;
              else failCount++;
            }
            toast({
              title: "Nodes parented",
              description: `${okCount} node${okCount !== 1 ? "s" : ""} parented${failCount > 0 ? `, ${failCount} skipped` : ""}`,
            });
          }
        }
        return;
      }

      // Alt+Shift+P - unparent all selected nodes
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "p" && !inEditable) {
        e.preventDefault();
        const ids = useGraphStore.getState().selectedNodeIds;
        if (ids.length > 0) {
          for (const nodeId of ids) {
            removeEdgesFromHandle(nodeId, "target");
          }
          toast({
            title: "Unparented",
            description: `${ids.length} node${ids.length !== 1 ? "s" : ""} unparented`,
          });
        }
        return;
      }

      // Ctrl+E - open export panel
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setExportOpen(true);
        return;
      }

      // Ctrl+I - show shortcuts dialog
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Ctrl+A
      if (mod && e.key.toLowerCase() === "a" && !inEditable) {
        e.preventDefault();
        // Set Zustand selection state
        setSelectedNodeIds(nodes.map((n) => n.id));
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => ({ ...n, selected: true })),
        }));
        // Also set React Flow's internal node state so selection renders immediately
        reactFlow.setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
        return;
      }

      // Ctrl+C - copy
      if (mod && e.key.toLowerCase() === "c" && !inEditable) {
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          setClipboard("copy", selectedNodeIds);
          toast({
            title: "Copied",
            description: `${selectedNodeIds.length} item${selectedNodeIds.length === 1 ? "" : "s"} copied`,
          });
        }
        return;
      }

      // Ctrl+X - cut (copy to clipboard, then immediately remove original)
      if (mod && e.key.toLowerCase() === "x" && !inEditable) {
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          setClipboard("cut", selectedNodeIds);
          // Remove original subtree immediately
          for (const nodeId of selectedNodeIds) {
            moveNode(nodeId);
          }
          toast({
            title: "Cut",
            description: `${selectedNodeIds.length} item${selectedNodeIds.length === 1 ? "" : "s"} cut: paste to place`,
          });
        }
        return;
      }

      // Ctrl+V - paste (if a folder is selected, paste as child; otherwise standalone)
      if (mod && e.key.toLowerCase() === "v" && !inEditable) {
        if (clipboard && clipboard.nodeIds.length > 0) {
          e.preventDefault();
          // Set paste position to mouse position before pasting
          const mousePos = useGraphStore.getState().mousePosition;
          useGraphStore.getState().setPastePosition(mousePos);
          // Find the selected folder to use as parent
          const selectedFolderId = selectedNodeIds.length === 1
            ? nodes.find((n) => n.id === selectedNodeIds[0] && n.data.type === "folder")?.id
            : undefined;
          pasteFromClipboard(selectedFolderId);
          toast({
            title: "Pasted",
            description: `${clipboard.nodeIds.length} item${clipboard.nodeIds.length === 1 ? "" : "s"} pasted${selectedFolderId ? " into folder" : " as standalone"}`,
          });
          if (clipboard.mode === "cut") {
            clearClipboard();
          }
        }
        return;
      }

      // Ctrl+D - duplicate under same parent
      if (mod && e.key.toLowerCase() === "d" && !inEditable) {
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          for (const nodeId of selectedNodeIds) {
            duplicateNodeUnderParent(nodeId);
          }
          toast({
            title: "Duplicated",
            description: `${selectedNodeIds.length} item${selectedNodeIds.length === 1 ? "" : "s"} duplicated under same parent`,
          });
        }
        return;
      }

      if (inEditable) return;

      // H: hide selected nodes. Shift+H: show all.
      if (e.key.toLowerCase() === "h" && !mod) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+H: show all and show files
          const hiddenCount = useGraphStore.getState().hiddenIds.length;
          if (hiddenCount > 0) {
            // setShowFiles(true) re-runs the large-folder auto-hide filter, so it must
            // run BEFORE showAll() — otherwise it re-hides a folder whose children
            // outnumber the threshold in the same gesture that's revealing them.
            setShowFiles(true);
            showAll();
            toast({
              title: "Unhid all nodes",
              description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored`,
            });
          } else {
            setShowFiles(true);
          }
        } else {
          // H: hide selected nodes
          if (selectedNodeIds.length > 0) {
            // Count subnodes (descendants) that will also be hidden
            const toHide = new Set(selectedNodeIds);
            const queue = [...selectedNodeIds];
            let subCount = 0;
            while (queue.length) {
              const id = queue.shift()!;
              for (const e of edges) {
                if (e.source === id && !toHide.has(e.target)) {
                  toHide.add(e.target);
                  queue.push(e.target);
                  subCount++;
                }
              }
            }
            hideNodes(selectedNodeIds);
            toast({
              title: "Nodes hidden",
              description: `${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"} hidden${subCount > 0 ? ` (${subCount} subnode${subCount === 1 ? "" : "s"})` : ""}: press Shift+H to restore`,
            });
          }
        }
        return;
      }

      // F2 - rename
      if (e.key === "F2") {
        if (selectedNodeIds.length === 1) {
          e.preventDefault();
          setRenamingId(selectedNodeIds[0], "canvas");
        }
        return;
      }

      // Enter - open file or focus first child
      if (e.key === "Enter") {
        if (selectedNodeIds.length === 1) {
          e.preventDefault();
          const node = nodes.find((n) => n.id === selectedNodeIds[0]);
          if (node && node.data.type === "file") {
            openNodeFile(node, dataSource)
              .then((ok) => {
                toast({
                  title: ok ? "Opening file" : "Cannot open file",
                  description: node.data.label,
                  ...(ok ? {} : { variant: "destructive" }),
                });
              })
              .catch(() => {
                toast({
                  title: "Cannot open file",
                  variant: "destructive",
                });
              });
          }
        }
        return;
      }

      // Arrow key navigation (Shift+Arrow adds to selection)
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const currentId = focusedNodeId ?? selectedNodeIds[selectedNodeIds.length - 1];
        if (!currentId) {
          // Focus the first node
          if (nodes.length > 0) {
            setFocusedNodeId(nodes[0].id);
            setSelectedNodeIds([nodes[0].id]);
          }
          return;
        }
        const dir =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        const hiddenIdsSet = new Set<string>(useGraphStore.getState().hiddenIds);
        const nextId = navigate(currentId, dir, nodes, edges, hiddenIdsSet);
        if (nextId) {
          setFocusedNodeId(nextId);
          if (e.shiftKey) {
            // Shift+Arrow: add to selection (avoid duplicates)
            const updated = selectedNodeIds.includes(nextId)
              ? selectedNodeIds
              : [...selectedNodeIds, nextId];
            setSelectedNodeIds(updated);
            useGraphStore.setState((s) => ({
              nodes: s.nodes.map((n) => ({
                ...n,
                selected: updated.includes(n.id),
              })),
            }));
          } else {
            // Plain Arrow: replace selection
            setSelectedNodeIds([nextId]);
            useGraphStore.setState((s) => ({
              nodes: s.nodes.map((n) => ({
                ...n,
                selected: n.id === nextId,
              })),
            }));
          }
          // Center the focused node in the viewport
          const nextNode = nodes.find((n) => n.id === nextId);
          if (nextNode) {
            reactFlow.setCenter(
              nextNode.position.x + 100,
              nextNode.position.y + 30,
              { zoom: reactFlow.getZoom(), duration: 300 },
            );
          }
        }
        return;
      }

      // Delete/Backspace: delete selected nodes + edges
      if (e.key === "Delete" || e.key === "Backspace") {
        const rfEdges = reactFlow.getEdges();
        const selectedEdgeIds = rfEdges.filter((ed) => ed.selected).map((ed) => ed.id);
        if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
          e.preventDefault();
          if (selectedEdgeIds.length > 0) deleteEdges(selectedEdgeIds);
          if (selectedNodeIds.length > 0) deleteNodes(selectedNodeIds);
          const parts: string[] = [];
          if (selectedNodeIds.length > 0) parts.push(`${selectedNodeIds.length} item${selectedNodeIds.length === 1 ? "" : "s"}`);
          if (selectedEdgeIds.length > 0) parts.push(`${selectedEdgeIds.length} edge${selectedEdgeIds.length === 1 ? "" : "s"}`);
          toast({ title: "Deleted", description: `${parts.join(" and ")} removed` });
        }
        return;
      }

      // Escape
      if (e.key === "Escape") {
        setSelectedNodeIds([]);
        setFocusedNodeId(null);
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => ({ ...n, selected: false })),
        }));
        return;
      }

      // Space - fit view
      if (e.code === "Space") {
        e.preventDefault();
        reactFlow.fitView({ duration: 600, padding: 0.2 });
        return;
      }

      // +/- and 0
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        reactFlow.zoomIn({ duration: 250 });
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        reactFlow.zoomOut({ duration: 250 });
      } else if (e.key === "0") {
        e.preventDefault();
        reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    undo,
    redo,
    setSearchOpen,
    direction,
    setDirection,
    selectedNodeIds,
    deleteNodes,
    setSelectedNodeIds,
    nodes,
    edges,
    setRenamingId,
    setClipboard,
    clipboard,
    clearClipboard,
    setFocusedNodeId,
    focusedNodeId,
    hideNodes,
    showAll,
    setExportOpen,
    setShortcutsOpen,
    reset,
    addNode,
    addStandaloneNode,
    duplicateNodeUnderParent,
    pasteFromClipboard,
    moveNode,
    connectNodes,
    removeEdgesFromHandle,
    deleteEdges,
    reactFlow,
    toast,
    user,
  ]);

  return null;
}
