"use client";

import type { FewerNode, FewerEdge, LayoutDirection } from "./types";
import { navigate } from "./navigation";
import { LOCAL_FS_FEATURES } from "./features";

// ─── Event-name constants ─────────────────────────────────────────
export const FEWER_ADD_NODE = "fewer-add-node";
export const FEWER_ADD_NODE_STANDALONE = "fewer-add-node-standalone";
export const FEWER_IMPORT_FOLDER = "fewer-import-folder";
export const FEWER_SAVE_GRAPH = "fewer-save-graph";

// ─── Pure helpers ─────────────────────────────────────────────────

export function pluralizeCount(n: number, noun: string, plural?: string): string {
  return `${n} ${n === 1 ? noun : (plural ?? noun + "s")}`;
}

export function countDescendants(nodeIds: string[], edges: FewerEdge[]): number {
  const seen = new Set(nodeIds);
  const queue = [...nodeIds];
  let count = 0;
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.source === id && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target); count++; }
    }
  }
  return count;
}

export function computeAltKey(e: KeyboardEvent, isMac: boolean): string | null {
  if (!e.altKey) return null;
  if (!isMac) return e.key.toLowerCase();
  const c = e.code;
  if (c.startsWith("Key")) return c.slice(3).toLowerCase();
  return e.key.toLowerCase();
}

export interface KeyContext {
  mod: boolean; altKey: string | null; alt: boolean; shift: boolean; inEditable: boolean; isMac: boolean;
}

export function buildKeyContext(e: KeyboardEvent): KeyContext {
  const target = e.target as HTMLElement | null;
  const inEditable = target != null && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  return { mod: e.ctrlKey || e.metaKey, altKey: computeAltKey(e, isMac), alt: e.altKey, shift: e.shiftKey, inEditable, isMac };
}

// ─── Context type ─────────────────────────────────────────────────

interface ClipboardData { mode: "copy" | "cut"; nodeIds: string[]; }

export interface StoreReader {
  direction: LayoutDirection;
  selectedNodeIds: string[];
  nodes: FewerNode[];
  edges: FewerEdge[];
  dataSource: string | null;
  clipboard: ClipboardData | null;
  focusedNodeId: string | null;
  hiddenIds: string[];
  mousePosition: { x: number; y: number } | null;
  localRootPath: string | null;
}

/**
 * Strip a graph-store state down to the slice keyboard rules read.  Accepts
 * the full store state (structural superset) and returns the typed reader.
 */
export function toStoreReader(s: Record<string, any>): StoreReader {
  return {
    direction: s.direction,
    selectedNodeIds: s.selectedNodeIds ?? [],
    nodes: s.nodes ?? [],
    edges: s.edges ?? [],
    dataSource: s.dataSource ?? null,
    clipboard: s.clipboard ?? null,
    focusedNodeId: s.focusedNodeId ?? null,
    hiddenIds: s.hiddenIds ?? [],
    mousePosition: s.mousePosition ?? null,
    localRootPath: s.localRootPath ?? null,
  };
}

export interface ShortcutCtx {
  getState(): StoreReader;
  undo(): void; redo(): void; setSearchOpen(v: boolean): void; setDirection(d: LayoutDirection): void;
  setSelectedNodeIds(ids: string[]): void; deleteNodes(ids: string[]): void;
  setRenamingId(id: string | null, source?: "canvas" | "folder"): void;
  setClipboard(mode: "copy" | "cut", ids: string[]): void;
  clearClipboard(): void; setFocusedNodeId(id: string | null): void;
  hideNodes(ids: string[]): void; showAll(): void; setShowFiles(v: boolean): void;
  setExportOpen(v: boolean): void; setShortcutsOpen(v: boolean): void; reset(): void;
  pasteFromClipboard(parentId?: string | null): void; moveNode(id: string): void;
  connectNodes(connection: { source: string; target: string }): { ok: boolean; reason?: string };
  removeEdgesFromHandle(nodeId: string, handleType: "source" | "target"): void;
  deleteEdges(ids: string[]): void; duplicateNodeUnderParent(id: string): void;
  setAuthOpen(v: boolean): void; relayout(): void;
  reactFlow: {
    setNodes(fn: (prev: readonly any[]) => any[]): void;
    fitView(opts?: { nodes?: { id: string }[]; duration?: number; padding?: number }): void;
    setCenter(x: number, y: number, opts?: { zoom?: number; duration?: number }): void;
    getZoom(): number; zoomIn(opts?: { duration?: number }): void;
    zoomOut(opts?: { duration?: number }): void;
    setViewport(v: { x: number; y: number; zoom: number }, opts?: { duration?: number }): void;
    getEdges(): { id: string; selected?: boolean }[];
  };
  toast(opts: { title: string; description?: string; variant?: "destructive" }): void;
  user: { id?: string } | null;
  localFs: typeof LOCAL_FS_FEATURES;
  openNodeFile(node: FewerNode, dataSource: string): Promise<boolean>;
  openFolderInExplorer(path: string): Promise<boolean>;
}

export interface ShortcutRule {
  test(e: KeyboardEvent, ctx: ShortcutCtx, kc: KeyContext): boolean;
  handle(e: KeyboardEvent, ctx: ShortcutCtx, kc: KeyContext): void;
}

// ─── Rule builder ─────────────────────────────────────────────────

export function buildKeyboardRules(): ShortcutRule[] {
  return [
    // Ctrl/Cmd+Z — undo / Shift — redo
    { test(_e,_ctx,kc) { return kc.mod && !kc.alt && _e.key.toLowerCase() === "z"; },
      handle(e,ctx,kc) { e.preventDefault(); if (kc.shift) ctx.redo(); else ctx.undo(); } },
    // Ctrl/Cmd+Y — redo
    { test(_e,_ctx,kc) { return kc.mod && !kc.alt && _e.key.toLowerCase() === "y"; },
      handle(e,ctx,_kc) { e.preventDefault(); ctx.redo(); } },
    // Ctrl/Cmd+F — open search
    { test(_e,_ctx,kc) { return kc.mod && !kc.alt && _e.key.toLowerCase() === "f"; },
      handle(e,ctx,_kc) { e.preventDefault(); ctx.setSearchOpen(true); } },
    // Ctrl/Cmd+L — cycle layout
    { test(_e,_ctx,kc) { return kc.mod && !kc.alt && _e.key.toLowerCase() === "l"; },
      handle(e,ctx,_kc) { e.preventDefault();
        const o: ("TB"|"LR"|"BT"|"RL")[] = ["TB","LR","BT","RL"];
        ctx.setDirection(o[(o.indexOf(ctx.getState().direction)+1)%o.length]); } },
    // Alt+Shift+N — clear canvas
    { test(_e,_ctx,kc) { return kc.alt && kc.shift && kc.altKey === "n"; },
      handle(e,ctx,_kc) { e.preventDefault(); if (ctx.getState().nodes.length>0) { ctx.reset(); ctx.toast({ title:"Canvas cleared" }); } } },
    // Alt+N — open Add Node dialog
    { test(_e,_ctx,kc) { return kc.alt && !kc.shift && kc.altKey === "n"; },
      handle(e,ctx,_kc) { e.preventDefault();
        const st=ctx.getState();
        window.dispatchEvent(new CustomEvent(
          st.selectedNodeIds.length===1 && st.nodes.some((n)=>n.id===st.selectedNodeIds[0]&&n.data.type==="folder")
          ? FEWER_ADD_NODE : FEWER_ADD_NODE_STANDALONE)); } },
    // Alt+R — re-layout
    { test(_e,_ctx,kc) { return kc.alt && !kc.shift && kc.altKey === "r"; },
      handle(e,ctx,_kc) { e.preventDefault(); ctx.relayout(); ctx.toast({ title:"Graph relayouted" }); } },
    // Alt+F — zoom to selection
    { test(_e,_ctx,kc) { return kc.alt && !kc.shift && kc.altKey === "f" && !kc.inEditable; },
      handle(e,ctx,_kc) { e.preventDefault();
        const s=ctx.getState().nodes.filter((n)=>ctx.getState().selectedNodeIds.includes(n.id));
        ctx.reactFlow.fitView(s.length>0
          ? { nodes:s.map((n)=>({id:n.id})), duration:600, padding:0.3 }
          : { duration:600, padding:0.2 }); } },
    // Alt+I — open import
    { test(_e,_ctx,kc) { return kc.alt && !kc.shift && kc.altKey === "i" && !kc.inEditable; },
      handle(e,_ctx,_kc) { e.preventDefault(); window.dispatchEvent(new CustomEvent(FEWER_IMPORT_FOLDER)); } },
    // Alt+O — open in explorer
    { test(_e,ctx,kc) { return kc.alt && !kc.shift && kc.altKey === "o" && !kc.inEditable && ctx.localFs.openInOs; },
      handle(e,ctx,_kc) { e.preventDefault();
        const st=ctx.getState();
        if (st.selectedNodeIds.length===1) {
          const node=st.nodes.find((n)=>n.id===st.selectedNodeIds[0]);
          if (node?.data.type==="folder"&&(st.dataSource==="directory"||st.localRootPath))
            ctx.openFolderInExplorer(node.data.path).then((ok)=>{ctx.toast({title:ok?"Opening folder":"Folder not found",description:node.data.label,...(ok?{}:{variant:"destructive"})});}); } } },
    // Alt+S — save graph
    { test(_e,_ctx,kc) { return kc.alt&&!kc.shift&&kc.altKey==="s"&&!kc.inEditable; },
      handle(e,ctx,_kc) { e.preventDefault(); if(!ctx.user){ctx.setAuthOpen(true);return;} window.dispatchEvent(new CustomEvent(FEWER_SAVE_GRAPH)); } },
    // Alt+P — parent nodes
    { test(_e,_ctx,kc) { return kc.alt&&!kc.shift&&kc.altKey==="p"&&!kc.inEditable; },
      handle(e,ctx,_kc) { e.preventDefault(); const ids=ctx.getState().selectedNodeIds;
        if(ids.length>=2){const last=ctx.getState().nodes.find((n)=>n.id===ids[ids.length-1]);if(last?.data.type==="folder"){
          let ok=0,fail=0;for(const c of ids.slice(0,-1)){if(ctx.connectNodes({source:ids[ids.length-1],target:c}).ok)ok++;else fail++;}
          ctx.toast({title:"Nodes parented",description:`${ok} node${ok!==1?"s":""} parented${fail?`, ${fail} skipped`:""}`});}}}},
    // Alt+Shift+P — unparent
    { test(_e,_ctx,kc) { return kc.alt&&kc.shift&&kc.altKey==="p"&&!kc.inEditable; },
      handle(e,ctx,_kc) { e.preventDefault();const ids=ctx.getState().selectedNodeIds;
        if(ids.length>0){for(const id of ids)ctx.removeEdgesFromHandle(id,"target");ctx.toast({title:"Unparented",description:`${ids.length} node${ids.length!==1?"s":""} unparented`});}}},
    // Ctrl/Cmd+E — open export
    { test(_e,_ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="e"; },
      handle(e,ctx,_kc) { e.preventDefault(); ctx.setExportOpen(true); } },
    // Ctrl/Cmd+I — shortcuts dialog
    { test(_e,_ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="i"; },
      handle(e,ctx,_kc) { e.preventDefault(); ctx.setShortcutsOpen(true); } },
    // Ctrl/Cmd+A — select all
    { test(_e,_ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="a"&&!kc.inEditable; },
      handle(e,ctx,_kc) { e.preventDefault();const st=ctx.getState();
        ctx.setSelectedNodeIds(st.nodes.map((n)=>n.id));ctx.reactFlow.setNodes((prev)=>prev.map((n)=>({...n,selected:true})));}},
    // Ctrl/Cmd+C — copy
    { test(_e,ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="c"&&!kc.inEditable&&ctx.getState().selectedNodeIds.length>0; },
      handle(e,ctx,_kc) { e.preventDefault();const ids=ctx.getState().selectedNodeIds;
        ctx.setClipboard("copy",ids);ctx.toast({title:"Copied",description:`${pluralizeCount(ids.length,"item")} copied`});}},
    // Ctrl/Cmd+X — cut
    { test(_e,ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="x"&&!kc.inEditable&&ctx.getState().selectedNodeIds.length>0; },
      handle(e,ctx,_kc) { e.preventDefault();const ids=ctx.getState().selectedNodeIds;
        ctx.setClipboard("cut",ids);for(const id of ids)ctx.moveNode(id);
        ctx.toast({title:"Cut",description:`${pluralizeCount(ids.length,"item")} cut: paste to place`});}},
// Ctrl/Cmd+V — paste
    { test(_e,_ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="v"&&!kc.inEditable; },
      handle(e,ctx,_kc) {const st=ctx.getState();if(st.clipboard&&st.clipboard.nodeIds.length>0){e.preventDefault();
        const sf=st.selectedNodeIds.length===1?st.nodes.find((n)=>n.id===st.selectedNodeIds[0]&&n.data.type==="folder")?.id:undefined;
        ctx.pasteFromClipboard(sf);ctx.toast({title:"Pasted",description:`${pluralizeCount(st.clipboard.nodeIds.length,"item")} pasted${sf?" into folder":" as standalone"}`});
        if(st.clipboard.mode==="cut")ctx.clearClipboard();}}},
    // Ctrl/Cmd+D — duplicate
    { test(_e,ctx,kc) { return kc.mod&&!kc.alt&&_e.key.toLowerCase()==="d"&&!kc.inEditable&&ctx.getState().selectedNodeIds.length>0; },
      handle(e,ctx,_kc) {e.preventDefault();const ids=ctx.getState().selectedNodeIds;
        for(const id of ids)ctx.duplicateNodeUnderParent(id);
        ctx.toast({title:"Duplicated",description:`${pluralizeCount(ids.length,"item")} duplicated under same parent`});}},
    // ── In-editable guard (no-op) ──
    {
      test(_e, _ctx, kc) { return kc.inEditable; },
      handle(_e, _ctx, _kc) { /* no-op */ },
    },

    // H — hide / Shift+H — show all
    {
      test(_e, _ctx, kc) { return _e.key.toLowerCase() === "h" && !kc.mod; },
      handle(e, ctx, kc) {
        e.preventDefault();
        if (kc.shift) {
          const n = ctx.getState().hiddenIds.length;
          if (n > 0) { ctx.setShowFiles(true); ctx.showAll(); ctx.toast({ title: "Unhid all nodes", description: `${pluralizeCount(n, "node")} restored` }); }
          else { ctx.setShowFiles(true); }
        } else {
          const ids = ctx.getState().selectedNodeIds;
          if (ids.length > 0) {
            const sub = countDescendants(ids, ctx.getState().edges);
            ctx.hideNodes(ids);
            ctx.toast({ title: "Nodes hidden", description: `${pluralizeCount(ids.length, "node")} hidden${sub > 0 ? ` (${pluralizeCount(sub, "subnode")})` : ""}: press Shift+H to restore` });
          }
        }
      },
    },

    // F2 — rename
    {
      test(_e, _ctx, kc) { return _e.key === "F2" && !kc.mod; },
      handle(e, ctx, _kc) {
        const ids = ctx.getState().selectedNodeIds;
        if (ids.length === 1) { e.preventDefault(); ctx.setRenamingId(ids[0], "canvas"); }
      },
    },

    // Enter — open file
    {
      test(_e, _ctx, kc) { return _e.key === "Enter" && !kc.mod; },
      handle(e, ctx, _kc) {
        const st = ctx.getState();
        if (st.selectedNodeIds.length === 1 && ctx.localFs.openFileInOs) {
          e.preventDefault();
          const node = st.nodes.find((n) => n.id === st.selectedNodeIds[0]);
          if (node?.data.type === "file") {
            ctx.openNodeFile(node, st.dataSource ?? "").then((ok) => {
              ctx.toast({ title: ok ? "Opening file" : "Cannot open file", description: node.data.label, ...(ok ? {} : { variant: "destructive" }) });
            });
          }
        }
      },
    },

    // Arrow key navigation
    {
      test(_e, _ctx, kc) { return _e.key.startsWith("Arrow") && !kc.mod && !kc.alt; },
      handle(e, ctx, kc) {
        e.preventDefault();
        const st = ctx.getState();
        const cur = st.focusedNodeId ?? st.selectedNodeIds[st.selectedNodeIds.length - 1];
        if (!cur) { if (st.nodes.length > 0) { ctx.setFocusedNodeId(st.nodes[0].id); ctx.setSelectedNodeIds([st.nodes[0].id]); } return; }
        const dir = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowLeft" ? "left" : "right";
        const next = navigate(cur, dir as any, st.nodes, st.edges, new Set(st.hiddenIds));
        if (next) {
          ctx.setFocusedNodeId(next);
          if (kc.shift) { ctx.setSelectedNodeIds(st.selectedNodeIds.includes(next) ? st.selectedNodeIds : [...st.selectedNodeIds, next]); }
          else { ctx.setSelectedNodeIds([next]); }
        }
        const nn = st.nodes.find((n) => n.id === next);
        if (nn) ctx.reactFlow.setCenter(nn.position.x + 100, nn.position.y + 30, { zoom: ctx.reactFlow.getZoom(), duration: 300 });
      },
    },

    // Delete / Backspace
    {
      test(_e, _ctx, kc) { return (_e.key === "Delete" || _e.key === "Backspace") && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) {
        e.preventDefault();
        const st = ctx.getState();
        const rfEdges = ctx.reactFlow.getEdges().filter((ed) => ed.selected).map((ed) => ed.id);
        if (rfEdges.length > 0) ctx.deleteEdges(rfEdges);
        if (st.selectedNodeIds.length > 0) ctx.deleteNodes(st.selectedNodeIds);
        const parts: string[] = [];
        if (st.selectedNodeIds.length > 0) parts.push(pluralizeCount(st.selectedNodeIds.length, "item"));
        if (rfEdges.length > 0) parts.push(pluralizeCount(rfEdges.length, "edge"));
        ctx.toast({ title: "Deleted", description: `${parts.join(" and ")} removed` });
      },
    },

    // Escape
    {
      test(_e, _ctx, kc) { return _e.key === "Escape" && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) { e.preventDefault(); ctx.setSelectedNodeIds([]); ctx.setFocusedNodeId(null); },
    },

    // Space — fit view
    {
      test(_e, _ctx, kc) { return _e.code === "Space" && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) { e.preventDefault(); ctx.reactFlow.fitView({ duration: 600, padding: 0.2 }); },
    },

    // +/- — zoom in
    {
      test(_e, _ctx, kc) { return (_e.key === "+" || _e.key === "=") && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) { e.preventDefault(); ctx.reactFlow.zoomIn({ duration: 250 }); },
    },

    // -/_ — zoom out
    {
      test(_e, _ctx, kc) { return (_e.key === "-" || _e.key === "_") && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) { e.preventDefault(); ctx.reactFlow.zoomOut({ duration: 250 }); },
    },

    // 0 — reset zoom
    {
      test(_e, _ctx, kc) { return _e.key === "0" && !kc.mod && !kc.alt; },
      handle(e, ctx, _kc) { e.preventDefault(); ctx.reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 }); },
    },
  ];
}

// ─── Dispatcher ───────────────────────────────────────────────────

export function handleKeyboardShortcut(
  e: KeyboardEvent,
  rules: ShortcutRule[],
  ctx: ShortcutCtx,
): boolean {
  const kc = buildKeyContext(e);
  for (const rule of rules) {
    if (rule.test(e, ctx, kc)) {
      rule.handle(e, ctx, kc);
      return true;
    }
  }
  return false;
}
