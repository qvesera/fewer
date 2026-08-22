"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGraphStore } from "@/store/graphStore";
import {
  Keyboard,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { isMac } from "@/lib/fewer/platform";
import { useAuth } from "@/hooks/use-auth";
import { LOCAL_FS_FEATURES } from "@/lib/fewer/features";

// Render the four navigation arrows with lucide icons so they all draw with
// the same stroke/weight. Raw ←→ glyphs can render thinner than ↑↓ in mono.
const ARROW_ICONS: Record<string, LucideIcon> = {
  "↑": ArrowUp,
  "↓": ArrowDown,
  "←": ArrowLeft,
  "→": ArrowRight,
};

interface Shortcut {
  keys: string[];
  action: string;
  /** Hidden for signed-out users (requires a cloud account). */
  signedInOnly?: boolean;
  /** Hidden when the feature flag is off (no side effect in plain filter). */
  featureKey?: keyof typeof LOCAL_FS_FEATURES;
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
      { keys: ["Shift", "H"], action: "Show all nodes" },
      { keys: ["Alt", "N"], action: "Open add node dialog" },
      { keys: ["Alt", "Shift", "N"], action: "Clear canvas" },
      { keys: ["Alt", "P"], action: "Parent selected nodes" },
      { keys: ["Alt", "Shift", "P"], action: "Unparent selected nodes" },
      { keys: ["Alt", "S"], action: "Save current graph", signedInOnly: true },
    ],
  },
  {
    title: "Clipboard & History",
    shortcuts: [
      { keys: ["⌘", "Ctrl", "C"], action: "Copy selected nodes" },
      { keys: ["⌘", "Ctrl", "X"], action: "Cut selected nodes" },
      { keys: ["⌘", "Ctrl", "V"], action: "Paste nodes" },
      { keys: ["⌘", "Ctrl", "D"], action: "Duplicate selected nodes" },
      { keys: ["⌘", "Ctrl", "Z"], action: "Undo" },
      { keys: ["⌘", "Ctrl", "Shift", "Z"], action: "Redo" },
      { keys: ["⌘", "Ctrl", "Y"], action: "Redo (alternate)" },
    ],
  },
  {
    title: "Navigation & View",
    shortcuts: [
      { keys: ["↑"], action: "Navigate up / parent" },
      { keys: ["↓"], action: "Navigate down / child" },
      { keys: ["←"], action: "Navigate left / sibling" },
      { keys: ["→"], action: "Navigate right / sibling" },
      { keys: ["Shift", "↑↓←→"], action: "Add to selection" },
      { keys: ["Alt", "R"], action: "Re-layout graph" },
      { keys: ["Alt", "F"], action: "Zoom to selection" },
      { keys: ["Alt", "I"], action: "Import" },
      { keys: ["Alt", "O"], action: "Open in file explorer", featureKey: "openInOs" },
    ],
  },
];

// Platform check: Mac/iOS report ⌘ and ⌥ (Option); everyone else uses Ctrl and Alt.
function Key({ kbd }: { kbd: string }) {
  // A keycap may hold one or more arrow glyphs (e.g. the combined ↑↓←→),
  // which are rendered as lucide icons for consistent weight/size.
  const parts = kbd.split("");
  const usesIcons = parts.some((c) => ARROW_ICONS[c]);
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:text-[11px] font-semibold text-muted-foreground shadow-sm">
      {usesIcons ? (
        <span className="flex items-center gap-0.5">
          {parts.map((c, i) => {
            const Icon = ARROW_ICONS[c];
            return Icon ? (
              <Icon key={i} className="h-3 w-3" />
            ) : (
              <span key={i}>{c}</span>
            );
          })}
        </span>
      ) : (
        kbd
      )}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  const { keys, action } = shortcut;
  // Pick the platform-native modifier label: ⌘/Ctrl for command, ⌥/Alt for option.
  const isCmd = keys.includes("⌘");
  const isAlt = !isCmd && keys[0] === "Alt";
  const mod = isCmd
    ? isMac()
      ? "⌘"
      : "Ctrl"
    : isAlt
      ? isMac()
        ? "⌥"
        : "Alt"
      : null;
  // The keys array carries the interchangeable modifier names (e.g. "⌘" and
  // "Ctrl", or "Alt"). Only intermediate keys that are real extras (Shift)
  // belong between the mod label and the final key — render just those.
  const extraKeys = keys.filter(
    (k) =>
      k !== mod &&
      k !== "⌘" &&
      k !== "Ctrl" &&
      k !== "Alt" &&
      k !== "⌥" &&
      k !== keys[keys.length - 1], // last key rendered separately
  );

  return (
    <div className="flex items-start sm:items-center justify-between gap-4 py-2 px-1 rounded-sm transition-colors hover:bg-muted/50">
      <span className="text-xs sm:text-sm font-medium text-foreground/80 tracking-tight leading-relaxed">
        {action}
      </span>
      <div className="flex shrink-0 items-center gap-1 mt-0.5 sm:mt-0">
        {mod ? (
          <>
            <Key kbd={mod} />
            {extraKeys.map((k, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-muted-foreground/40">+</span>
                <Key kbd={k} />
              </div>
            ))}
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
  const { user } = useAuth();

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
                {group.shortcuts
                  .filter((s) => (!s.signedInOnly || user) && (!s.featureKey || LOCAL_FS_FEATURES[s.featureKey]))
                  .map((s, idx) => (
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