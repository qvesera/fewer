import { BellRing, FileText, History, Link2, Shapes } from "lucide-react";
import { GroupDemo } from "./GroupDemo";
import type { ProofKind } from "@/lib/fewer/marketingFeatures";

/**
 * The micro-proofs the hotspot callout renders (T-150 follow-up).
 *
 * Every proof is a small piece of the product's own furniture - a script, a
 * group frame, an action list - built from the `--fewer-*` tokens, not a
 * screenshot and not a paragraph. The job is to be read in a second: the
 * callout around it already carries the headline and the one-line summary, so
 * a proof that needs explaining would be one more wall of text.
 *
 * `Record<ProofKind, …>` on purpose: adding a feature to the catalogue without
 * a proof for it fails the build here and the test in
 * marketingFeatures.test.ts, instead of shipping an empty slot.
 */

const IMPORT_CHIPS = [
  "disk",
  "ASCII tree",
  "JSON",
  "CSV",
  "DOT",
  "zip / tar / 7z / RAR",
  "Internet Archive",
  "URL crawl",
  "GitHub",
];

const EXPORT_CHIPS = ["SVG", "PNG", "JSON", "CSV", "DOT", "sh", "txt", ".fwr"];

const BATCH_ACTIONS = [
  "Rename…",
  "Copy",
  "Cut",
  "Duplicate",
  "Move to Folder…",
  "Unparent",
  "Hide",
  "Delete 8 items",
];

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <li
      className="rounded-md border px-2 py-1 font-mono text-[11px]"
      style={{
        borderColor: accent ? "var(--fewer-folder-border)" : "var(--border)",
        color: accent ? "var(--fewer-folder-icon)" : "var(--muted-foreground)",
      }}
    >
      {children}
    </li>
  );
}

function ChipRow({
  items,
  accent,
}: {
  items: string[];
  /** Optional per-chip accent, e.g. only `.fwr`. */
  accent?: (label: string) => boolean;
}) {
  return (
    <ul className="flex max-w-full flex-wrap justify-center gap-2">
      {items.map((label) => (
        <Chip key={label} accent={accent?.(label)}>
          {label}
        </Chip>
      ))}
    </ul>
  );
}

/** A mono line of the shape `from → to`, the way a find/replace preview reads. */
function RenameRow({ from, to }: { from: string; to: string }) {
  return (
    <li className="flex items-center gap-2 font-mono text-[11px]">
      <span style={{ color: "var(--fewer-file-subtle-text)" }}>{from}</span>
      <span aria-hidden="true" style={{ color: "var(--muted-foreground)" }}>
        →
      </span>
      <span style={{ color: "var(--fewer-file-text)" }}>{to}</span>
    </li>
  );
}

const PROOFS: Record<ProofKind, () => React.ReactNode> = {
  shell: () => (
    <figure
      className="m-0 w-full max-w-[260px] rounded-lg border p-3 font-mono text-[11px]"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <figcaption
        className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        scaffold.sh
      </figcaption>
      <pre className="m-0 overflow-hidden whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>
        {`mkdir -p src/components
mkdir -p src/hooks
mkdir -p docs`}
      </pre>
    </figure>
  ),
  group: () => <GroupDemo />,
  batch: () => <ChipRow items={BATCH_ACTIONS} />,
  rename: () => (
    <ul className="flex flex-col gap-1.5">
      <RenameRow from="Button.tsx" to="Button.jsx" />
      <RenameRow from="Card.tsx" to="Card.jsx" />
      <RenameRow from="Layout.tsx" to="Layout.jsx" />
      <li
        className="mt-1 font-mono text-[10px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        find *.tsx · replace *.jsx · 40 files
      </li>
    </ul>
  ),
  keys: () => (
    <ul className="flex flex-wrap items-center justify-center gap-2">
      {[
        ["← ↑ ↓ →", "walk"],
        ["Space", "fit"],
        ["Alt+R", "organize"],
        ["/", "search"],
        ["F2", "rename"],
        ["Ctrl+Z", "undo"],
      ].map(([key, verb]) => (
        <li key={key} className="flex items-center gap-1.5">
          <kbd
            className="rounded-md border px-2 py-1 font-mono text-[11px]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            {key}
          </kbd>
          <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            {verb}
          </span>
        </li>
      ))}
    </ul>
  ),
  layout: () => (
    <div className="flex w-full max-w-[240px] flex-col gap-2">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span style={{ color: "var(--muted-foreground)" }}>Crown Shyness</span>
        <span style={{ color: "var(--foreground)" }}>1 → 2</span>
      </div>
      <div
        className="relative h-1.5 w-full rounded-full"
        style={{ background: "var(--border)" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: "66%", background: "var(--fewer-folder-icon)" }}
        />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2"
          style={{
            left: "66%",
            marginLeft: -8,
            background: "var(--fewer-folder-bg)",
            borderColor: "var(--fewer-folder-icon)",
          }}
        />
      </div>
      <p className="m-0 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
        Alt+R re-flows the whole tree
      </p>
    </div>
  ),
  import: () => <ChipRow items={IMPORT_CHIPS} />,
  export: () => <ChipRow items={EXPORT_CHIPS} accent={(label) => label === ".fwr"} />,
  watch: () => (
    <div
      className="flex w-full max-w-[280px] flex-col gap-2 rounded-lg border p-3"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 shrink-0" style={{ color: "var(--fewer-folder-icon)" }} aria-hidden="true" />
        <span className="truncate font-mono text-[11px]" style={{ color: "var(--foreground)" }}>
          docs.fewer.directory/
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span style={{ color: "var(--muted-foreground)" }}>2 files changed</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span style={{ color: "var(--muted-foreground)" }}>1 new</span>
      </div>
      <span
        className="w-fit rounded-md border px-2 py-1 font-mono text-[10px]"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        daily email digest
      </span>
    </div>
  ),
  themes: () => (
    <div className="flex items-center gap-3">
      {[
        { background: "var(--fewer-file-bg)", borderColor: "var(--fewer-file-border)" },
        {
          background: "var(--muted)",
          borderColor: "var(--fewer-folder-border)",
        },
      ].map((vars, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-xl border px-3 py-2"
          style={vars}
        >
          <Shapes className="h-4 w-4" style={{ color: "var(--fewer-folder-icon)" }} aria-hidden="true" />
          <span className="font-mono text-[11px]" style={{ color: "var(--fewer-file-text)" }}>
            theme-{i + 1}
          </span>
        </div>
      ))}
    </div>
  ),
  share: () => (
    <ul className="flex w-full max-w-[260px] flex-col gap-2">
      <li
        className="flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px]"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        fewer.directory/g/8f3k
      </li>
      <li
        className="flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px]"
        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      >
        <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        v4 · 2 hours ago
      </li>
    </ul>
  ),
  tags: () => (
    <div className="flex flex-col items-center gap-2">
      {/* Hard-edged segments, one per tag, the way the canvas draws a ring. */}
      <div
        className="rounded-xl p-[3px]"
        style={{
          background:
            "conic-gradient(#f87171 0 33.3%, #22d3ee 33.3% 66.6%, #a3e635 66.6% 100%)",
        }}
        aria-hidden="true"
      >
        <div
          className="flex items-center gap-2 rounded-[9px] border px-3 py-2"
          style={{ background: "var(--fewer-file-bg)", borderColor: "var(--fewer-file-border)" }}
        >
          <FileText className="h-4 w-4" style={{ color: "var(--fewer-file-icon)" }} />
          <span className="font-mono text-[11px]" style={{ color: "var(--fewer-file-text)" }}>
            types.ts
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {["#f87171", "#22d3ee", "#a3e635"].map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
        ))}
        <span
          className="rounded-md border px-1.5 font-mono text-[10px]"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          +2
        </span>
      </div>
    </div>
  ),
};

export function FeatureProof({ kind }: { kind: ProofKind }) {
  return (
    <div className="flex h-[150px] w-full items-center justify-center overflow-hidden">
      {PROOFS[kind]()}
    </div>
  );
}
