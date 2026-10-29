"use client";

import { useState } from "react";
import { ChevronDown, FileText, Shapes } from "lucide-react";

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
        className="border px-2.5 py-1.5 transition-all duration-300"
        style={{
          background: "var(--fewer-group-bg)",
          borderColor: "var(--fewer-group-border)",
          borderRadius: collapsed ? 999 : 12,
          color: "var(--fewer-group-text)",
        }}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="group-demo-members"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full cursor-pointer items-center gap-2 text-left"
        >
          <Shapes className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fewer-group-icon)" }} aria-hidden="true" />
          <span className="truncate font-mono text-xs font-medium">docs</span>
          <span
            className="ml-auto shrink-0 text-2xs"
            style={{ color: "var(--fewer-group-subtle-text)" }}
          >
            {collapsed ? "3 cards" : "group"}
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 transition-transform duration-300"
            style={{
              color: "var(--fewer-group-icon)",
              transform: collapsed ? "rotate(-90deg)" : "none",
            }}
            aria-hidden="true"
          />
        </button>
        <ul
          id="group-demo-members"
          className="grid gap-1 overflow-hidden transition-all duration-300"
          style={{
            // Cap = the expanded content height, so the collapse animation
            // has a value to animate from and nothing is ever clipped.
            maxHeight: collapsed ? 0 : 84,
            marginTop: collapsed ? 0 : 6,
            opacity: collapsed ? 0 : 1,
          }}
          aria-hidden={collapsed}
        >
          {MEMBERS.map((name) => (
            <li
              key={name}
              className="flex items-center gap-1.5 rounded-md border px-2 py-0.5"
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
                className="truncate font-mono text-2xs"
                style={{ color: "var(--fewer-file-text)" }}
              >
                {name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
