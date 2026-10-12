import Link from "next/link";
import {
  Network,
  Keyboard,
  Shapes,
  Download,
  Share2,
  Cloud,
  LayoutGrid,
  ShieldCheck,
  Github,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { APP_URL } from "./MarketingLayout";
import { buttonVariants } from "@/components/ui/button";

/**
 * The feature grid, kept to what the FREE product actually delivers today
 * (T-149): groups are the headline (and free everywhere), the import story is
 * widened to everything the dialog reads, and the export count is 8 formats
 * since the `.fwr` document shipped. Nothing Pro-only (split views, tags) and
 * nothing that needs a purchase path is advertised here.
 */
const FEATURES = [
  {
    icon: Shapes,
    title: "Canvas groups",
    body: "Draw a titled frame around cards, colour it, add a note, collapse it to a pill, and nest groups inside groups. Move or scale one and every member follows — a single undo step. Annotations, not folders: your tree stays yours.",
  },
  {
    icon: Network,
    title: "Visualize any source",
    body: "Import from your disk, a pasted ASCII tree, JSON, CSV or DOT, a GitHub repo, a crawled file index, an Internet Archive item — or an archive read straight from the dialog (zip, tar, 7z, RAR) without unpacking anything.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-first navigation",
    body: "Move through the tree with arrow keys, search across every card, and jump with shortcuts. No mouse required once you're in the flow.",
  },
  {
    icon: LayoutGrid,
    title: "Arrange and edit",
    body: "Organize re-flows the tree on demand, Crown Shyness spaces sibling subtrees the way you like it, and you add, rename, delete or drag cards right on the canvas — each view keeps its own undo history.",
  },
  {
    icon: Download,
    title: "Export in 8 formats",
    body: "SVG, PNG, JSON, CSV, DOT, shell script, ASCII tree — plus the .fwr graph document, which round-trips cards, positions, tags and groups exactly as you saved them.",
  },
  {
    icon: Share2,
    title: "Share and save",
    body: "Compress a small graph into the URL or mint a short server-backed link, save graphs to your account, and keep version history to get a previous state back.",
  },
  {
    icon: Cloud,
    title: "Connect and watch",
    body: "Optional OAuth to GitHub, Google Drive, OneDrive, SharePoint, Azure DevOps and Azure Blob — and a daily email digest when a watched public file index changes.",
  },
  {
    icon: Sparkles,
    title: "Themes and a gallery",
    body: "Tune every colour yourself or start from a preset, then browse the community gallery for graphs and themes other people shared — open one straight into the app.",
  },
];

/** Where the page sends people who want the detail (docs, not marketing). */
const LEARN_MORE = [
  { label: "Groups & annotations", href: "/docs/editing" },
  { label: "Import & export", href: "/docs/import-export" },
  { label: "Keyboard shortcuts", href: "/docs/shortcuts" },
];

const PRIVACY_POINTS = [
  "Runs locally in your browser — your directory contents stay on your device by default.",
  "No account required. Sign in is optional, and only used for saved graphs and sharing across devices.",
  "Optional cloud connections are scoped: we fetch only the trees you ask for, and never store your connected account's contents.",
  "No selling your data, no advertising trackers, no hidden telemetry.",
  "Watch digests are opt-in; we only store the public URLs you add and email changes you requested.",
  "Hosting operates on standard server logs only.",
];

export function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-fewer-file-icon" />
          Privacy-first · Open source (AGPLv3) · Runs in your browser
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Turn any directory into an{" "}
          <span className="bg-gradient-to-r from-brand-fuchsia to-brand-cyan bg-clip-text text-transparent">
            interactive graph
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          fewer turns any file system into a graph you can explore, edit, and export —
          nothing to install, none of your data leaves your browser unless you want it to.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
            Launch the app
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Read the docs
          </Link>
        </div>

        {/* Screenshot */}
        <div className="mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border border-border shadow-2xl">
          <img src="/demo.png" alt="fewer graph visualization of a directory" className="w-full" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40 bg-background/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            What fewer does
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
            A codebase, a project to document, a mess to reorganize — fewer helps you finally
            <em> see </em> the shape of it.
          </p>
          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-fewer-folder-icon/50"
              >
                <f.icon className="h-6 w-6 text-fewer-file-icon" />
                <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
          {/* The detail lives in the docs; the page only points at it. */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            {LEARN_MORE.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy / data transparency */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto max-w-6xl px-6 grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your data stays yours
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              fewer is designed around a simple principle: your directory data stays yours.
              Signing in or connecting a cloud account is entirely optional, and when you do,
              we only use what you explicitly ask for.
            </p>
            <div className="mt-8">
              <Link
                href="/privacy"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <ShieldCheck className="h-4 w-4" />
                Read the Privacy Policy
              </Link>
            </div>
          </div>
          <ul className="space-y-4">
            {PRIVACY_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground/90"
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-fewer-file-icon" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Open source */}
      <section className="border-t border-border/40 bg-background/60 py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Open source</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            fewer is free software under the AGPLv3. Build on it, read the source, report
            issues, and shape where it goes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://github.com/qvesera/fewer"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
            <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
              Launch the app
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
