"use client";

import { useState } from "react";
import { FileText, Shapes } from "lucide-react";

const MEMBERS = ["editing.md", "import-export.md", "shortcuts.md"];

/**
 * The headline free feature, demonstrated instead of described (T-150): a real
 * group frame around three cards that collapses to a pill, the same way the
 * canvas does. Tokens come from --fewer-group-* so the demo cannot drift from
 * the product palette.
 */
export function GroupDemo() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col justify-center">
      <div
        className="border px-3 py-2 transition-all duration-300"
        style={{
          background: "var(--fewer-group-bg)",
          borderColor: "var(--fewer-group-border)",
          borderRadius: collapsed ? 999 : 12,
          color: "var(--fewer-group-text)",
        }}
      >
        <div className="flex items-center gap-2">
          <Shapes className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fewer-group-icon)" }} aria-hidden="true" />
          <span className="truncate font-mono text-[11px] font-medium">docs</span>
          <span
            className="ml-auto shrink-0 text-[10px]"
            style={{ color: "var(--fewer-group-subtle-text)" }}
          >
            {collapsed ? "3 cards" : "group"}
          </span>
        </div>
        <ul
          className="grid gap-1.5 overflow-hidden transition-all duration-300"
          style={{
            maxHeight: collapsed ? 0 : 110,
            marginTop: collapsed ? 0 : 8,
            opacity: collapsed ? 0 : 1,
          }}
          aria-hidden={collapsed}
        >
          {MEMBERS.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1"
              style={{
                background: "var(--fewer-file-bg)",
                borderColor: "var(--fewer-file-border)",
              }}
            >
              <FileText
                className="h-3 w-3 shrink-0"
                style={{ color: "var(--fewer-file-icon)" }}
                aria-hidden="true"
              />
              <span
                className="truncate font-mono text-[10px]"
                style={{ color: "var(--fewer-file-text)" }}
              >
                {name}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        className="mt-3 cursor-pointer self-start rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        {collapsed ? "Expand the group" : "Collapse the group"}
      </button>
    </div>
  );
}
