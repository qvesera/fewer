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
      { keys: ["⌘", "Ctrl", "I"], action: "Show shortcuts dialog" },
      { keys: ["Space"], action: "Fit graph to viewport" },
      { keys: ["Esc"], action: "Clear selection / close panels" },
      { keys: ["+"], action: "Zoom in" },
      { keys: ["-"], action: "Zoom out" },
      { keys: ["0"], action: "Reset zoom to 100%" },
    ],
  },
  {
    title: "Node Operations",
    shortcuts: [
      { keys: ["Alt", "N"], action: "New child or standalone node" },
      { keys: ["Alt", "Shift", "N"], action: "Clear canvas" },
      { keys: ["⌘", "Ctrl", "A"], action: "Select all nodes" },
      { keys: ["F2"], action: "Rename selected node" },
      { keys: ["Enter"], action: "Open selected file in new tab" },
      { keys: ["Delete"], action: "Delete selected nodes" },
      { keys: ["H"], action: "Hide selected nodes" },
      { keys: ["Shift", "H"], action: "Unhide all nodes" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["↑"], action: "Navigate to parent / previous sibling" },
      { keys: ["↓"], action: "Navigate to first child / next sibling" },
      { keys: ["←"], action: "Navigate to previous sibling / parent" },
      { keys: ["→"], action: "Navigate to next sibling / first child" },
    ],
  },
  {
    title: "Clipboard & History",
    shortcuts: [
      { keys: ["⌘", "Ctrl", "C"], action: "Copy selected nodes" },
      { keys: ["⌘", "Ctrl", "X"], action: "Cut selected nodes" },
      { keys: ["⌘", "Ctrl", "V"], action: "Paste into folder" },
      { keys: ["⌘", "Ctrl", "Z"], action: "Undo" },
      { keys: ["⌘", "Ctrl", "Shift", "Z"], action: "Redo" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["Alt", "R"], action: "Re-layout graph" },
      { keys: ["Alt", "F"], action: "Zoom to selection" },
    ],
  },
  {
    title: "Import",
    shortcuts: [
      { keys: ["Alt", "O"], action: "Open/import folder" },
      { keys: ["Alt", "U"], action: "Import from file" },
    ],
  },
];

export function ShortcutsDialog() {
  const open = useGraphStore((s) => s.shortcutsOpen);
  const setOpen = useGraphStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Expanded dialog width constraint to 3xl for roomy desktop rendering */}
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

        {/* 1 Column on Mobile, 2 Columns on Medium+ screens */}
        <div className="overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary/80 border-b border-border/40 pb-1 mb-1">
                {group.title}
              </h3>
              
              <div className="flex flex-col gap-1">
                {group.shortcuts.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-start sm:items-center justify-between gap-4 py-2 px-1 rounded-sm transition-colors hover:bg-muted/50"
                  >
                    {/* Allowed text to naturally wrap instead of cutting off */}
                    <span className="text-xs sm:text-sm font-medium text-foreground/80 tracking-tight leading-relaxed">
                      {s.action}
                    </span>
                    
                    <div className="flex shrink-0 items-center gap-1 mt-0.5 sm:mt-0">
                      {s.keys.map((key, i) => {
                        const isModKey = key === "⌘" || key === "Ctrl" || key === "Alt";
                        
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <kbd 
                              className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground shadow-sm
                                ${key === "⌘" ? "block md:block" : ""}
                                ${key === "Ctrl" ? "block md:block" : ""}
                                ${key === "Alt" ? "block md:block" : ""}`}
                            >
                              {key}
                            </kbd>
                            
                            {/* Smart spacer logic: Show "/" between Mac/Win modifiers, or standard "+" for sequences */}
                            {i < s.keys.length - 1 && (
                              <span className="text-[10px] font-medium text-muted-foreground/40">
                                {isModKey && s.keys[i + 1] === "Ctrl" ? "/" : "+"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}