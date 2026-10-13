import Link from "next/link";
import { ArrowRight, Github, History, Link2 } from "lucide-react";
import { GroupDemo } from "./GroupDemo";
import { Reveal } from "./Reveal";

/**
 * The capability section (T-150). Four stories with a small working visual
 * each, then the rest as short scan-friendly bullets - the old page gave eight
 * equal cards a 40-word paragraph each, which reads as noise, not as a feature
 * list. `id="features"` is the anchor the nav points at, and this section owns
 * the phrases e2e/marketing.spec.ts pins (export count, "Canvas groups",
 * cards-not-nodes vocabulary, GitHub-only imports).
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

const BULLETS = [
  {
    title: "Keyboard-first",
    body: "Arrow keys through the tree, search across every card, and shortcuts for everything. No mouse required once you are in the flow.",
  },
  {
    title: "Arrange and edit",
    body: "Organize re-flows the tree on demand, Crown Shyness spaces sibling subtrees, and you add, rename or drag cards right on the canvas.",
  },
  {
    title: "Connect and watch",
    body: "Optional OAuth to GitHub, Google Drive, OneDrive, SharePoint, Azure DevOps and Azure Blob, plus a daily digest when a watched public index changes.",
  },
  {
    title: "Themes and a gallery",
    body: "Tune every colour yourself or start from a preset, then open graphs and themes other people shared, straight into the app.",
  },
];

/** Where the page sends people who want the detail (docs, not marketing). */
const LEARN_MORE = [
  { label: "Groups & annotations", href: "/docs/editing" },
  { label: "Import & export", href: "/docs/import-export" },
  { label: "Keyboard shortcuts", href: "/docs/shortcuts" },
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

function StoryShell({
  title,
  body,
  visual,
  delay,
}: {
  title: string;
  body: string;
  visual: React.ReactNode;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <article className="flex h-full flex-col rounded-xl border border-border/60 bg-card/50 p-6">
        <div className="mb-6 flex min-h-[150px] flex-1 items-center">{visual}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </article>
    </Reveal>
  );
}

export function Capabilities() {
  return (
    <section id="features" className="relative z-10 border-t border-border/40 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What fewer does</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            A codebase, a project to document, a mess to reorganise: fewer helps you finally
            <em> see </em>
            the shape of it.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <StoryShell
            delay={0}
            title="Canvas groups"
            body="Draw a titled frame around cards: colour it, add a note, collapse it to a pill, and nest groups inside groups. Move or scale one and every member follows in a single undo step."
            visual={<GroupDemo />}
          />
          <StoryShell
            delay={90}
            title="Visualize any source"
            body="Import from your disk, a pasted ASCII tree, JSON, CSV or DOT, a GitHub repo, a crawled file index, an Internet Archive item, or an archive read straight from the dialog, without unpacking anything."
            visual={
              <ul className="flex flex-wrap gap-2">
                {IMPORT_CHIPS.map((label) => (
                  <Chip key={label}>{label}</Chip>
                ))}
              </ul>
            }
          />
          <StoryShell
            delay={180}
            title="Export in 8 formats"
            body="The .fwr graph document round-trips cards, positions, tags and groups exactly as you saved them; the rest are for everything else you already use."
            visual={
              <ul className="flex flex-wrap gap-2">
                {EXPORT_CHIPS.map((label) => (
                  <Chip key={label} accent={label === ".fwr"}>
                    {label}
                  </Chip>
                ))}
              </ul>
            }
          />
          <StoryShell
            delay={270}
            title="Share and save"
            body="Compress a small graph into the URL or mint a short server-backed link, save graphs to your account, and keep version history to get a previous state back."
            visual={
              <ul className="flex w-full flex-col gap-2">
                <li className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  fewer.directory/g/8f3k
                </li>
                <li className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  v4 · 2 hours ago
                </li>
                <li className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  <Github className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  saved to your account
                </li>
              </ul>
            }
          />
        </div>

        {/* The rest, as a list to scan rather than a grid to read. */}
        <Reveal delay={90}>
          <ul className="mt-12 grid gap-x-12 gap-y-6 sm:grid-cols-2">
            {BULLETS.map((b) => (
              <li key={b.title}>
                <h3 className="text-sm font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* The detail lives in the docs; the page only points at it. */}
        <Reveal delay={180}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            {LEARN_MORE.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {l.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
