"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGraphStore } from "@/store/graphStore";
import { Keyboard } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; action: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: "Ctrl/Cmd+F", action: "Open search panel" },
      { keys: "Ctrl/Cmd+E", action: "Open export panel" },
      { keys: "Ctrl/Cmd+L", action: "Cycle layout direction (TB → LR → BT → RL)" },
      { keys: "Ctrl/Cmd+I", action: "Show this shortcuts dialog" },
      { keys: "Space", action: "Fit graph to viewport" },
      { keys: "Escape", action: "Clear selection / close panels" },
      { keys: "+ / =", action: "Zoom in" },
      { keys: "-", action: "Zoom out" },
      { keys: "0", action: "Reset zoom to 100%" },
    ],
  },
  {
    title: "Node Operations",
    shortcuts: [
      { keys: "Ctrl/Cmd+N", action: "New node (child of selected folder, or standalone)" },
      { keys: "Ctrl/Cmd+Shift+N", action: "Clear canvas" },
      { keys: "Ctrl/Cmd+A", action: "Select all nodes" },
      { keys: "F2", action: "Rename selected node" },
      { keys: "Enter", action: "Open selected file in new tab" },
      { keys: "Delete / Backspace", action: "Delete selected nodes" },
      { keys: "H", action: "Hide selected nodes" },
      { keys: "Shift+H", action: "Unhide all nodes" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "↑", action: "Navigate to parent (or previous sibling at root)" },
      { keys: "↓", action: "Navigate to first child (or next sibling)" },
      { keys: "←", action: "Navigate to previous sibling (or parent)" },
      { keys: "→", action: "Navigate to next sibling (or first child)" },
    ],
  },
  {
    title: "Clipboard",
    shortcuts: [
      { keys: "Ctrl/Cmd+C", action: "Copy selected nodes" },
      { keys: "Ctrl/Cmd+X", action: "Cut selected nodes" },
      { keys: "Ctrl/Cmd+V", action: "Paste into focused/selected folder" },
    ],
  },
  {
    title: "History",
    shortcuts: [
      { keys: "Ctrl/Cmd+Z", action: "Undo" },
      { keys: "Ctrl/Cmd+Shift+Z", action: "Redo" },
      { keys: "Ctrl/Cmd+Y", action: "Redo (alternative)" },
    ],
  },
];

export function ShortcutsDialog() {
  const open = useGraphStore((s) => s.shortcutsOpen);
  const setOpen = useGraphStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            All shortcuts work with Ctrl on Windows/Linux and Cmd on macOS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((s) => (
                  <div
                    key={s.keys}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                  >
                    <span className="text-sm text-foreground/90">{s.action}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.keys.split(" + ").map((key, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
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
