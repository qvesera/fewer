"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGraphStore } from "@/store/graphStore";
import { Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  action: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["⌘", "Ctrl", "F"], action: "Open search panel" },
      { keys: ["⌘", "Ctrl", "E"], action: "Open export panel" },
      { keys: ["⌘", "Ctrl", "L"], action: "Cycle layout direction" },
      { keys: ["⌘", "Ctrl", "I"], action: "Show shortcuts" },
      { keys: ["Space"], action: "Fit graph to viewport" },
      { keys: ["Esc"], action: "Clear selection / close panels" },
      { keys: ["+"], action: "Zoom in" },
      { keys: ["-"], action: "Zoom out" },
      { keys: ["0"], action: "Reset zoom" },
    ],
  },
  {
    title: "Selection & Nodes",
    shortcuts: [
      { keys: ["⌘", "Ctrl", "A"], action: "Select all nodes" },
      { keys: ["F2"], action: "Rename selected node" },
      { keys: ["Enter"], action: "Open selected file" },
      { keys: ["Delete"], action: "Delete selected nodes" },
      { keys: ["H"], action: "Hide selected nodes" },
      { keys: ["Shift", "H"], action: "Unhide all nodes" },
      { keys: ["Alt", "N"], action: "Open add node dialog" },
      { keys: ["Alt", "Shift", "N"], action: "Clear canvas" },
    ],
  },
  {
    title: "Clipboard & History",
    shortcuts: [
      { keys: ["⌘", "Ctrl", "C"], action: "Copy selected nodes" },
      { keys: ["⌘", "Ctrl", "X"], action: "Cut selected nodes" },
      { keys: ["⌘", "Ctrl", "V"], action: "Paste nodes" },
      { keys: ["⌘", "Ctrl", "Z"], action: "Undo" },
      { keys: ["⌘", "Ctrl", "Shift", "Z"], action: "Redo" },
    ],
  },
  {
    title: "Navigation & View",
    shortcuts: [
      { keys: ["↑"], action: "Navigate up / parent" },
      { keys: ["↓"], action: "Navigate down / child" },
      { keys: ["←"], action: "Navigate left / sibling" },
      { keys: ["→"], action: "Navigate right / sibling" },
      { keys: ["Alt", "R"], action: "Re-layout graph" },
      { keys: ["Alt", "F"], action: "Zoom to selection" },
      { keys: ["Alt", "O"], action: "Open / import folder" },
      { keys: ["Alt", "U"], action: "Import from file" },
    ],
  },
];

function Key({ kbd }: { kbd: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground shadow-sm">
      {kbd}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  const { keys, action } = shortcut;
  const hasMod = keys.includes("⌘");

  return (
    <div className="flex items-start sm:items-center justify-between gap-4 py-2 px-1 rounded-sm transition-colors hover:bg-muted/50">
      <span className="text-xs sm:text-sm font-medium text-foreground/80 tracking-tight leading-relaxed">
        {action}
      </span>
      <div className="flex shrink-0 items-center gap-1 mt-0.5 sm:mt-0">
        {hasMod ? (
          <>
            <Key kbd="⌘" />
            <span className="text-[10px] font-medium text-muted-foreground/40">or</span>
            <Key kbd="Ctrl" />
            <span className="text-[10px] font-medium text-muted-foreground/40">+</span>
            <Key kbd={keys[keys.length - 1]} />
          </>
        ) : (
          keys.map((k, i) => (
            <div key={i} className="flex items-center gap-1">
              <Key kbd={k} />
              {i < keys.length - 1 && (
                <span className="text-[10px] font-medium text-muted-foreground/40">+</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ShortcutsDialog() {
  const open = useGraphStore((s) => s.shortcutsOpen);
  const setOpen = useGraphStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] flex flex-col p-4 sm:p-6 gap-6">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold tracking-tight">
            <Keyboard className="h-5 w-5 text-muted-foreground" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
            Press combinations together to trigger rapid workspace actions.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary/80 border-b border-border/40 pb-1 mb-1">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1">
                {group.shortcuts.map((s, idx) => (
                  <ShortcutRow key={idx} shortcut={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}