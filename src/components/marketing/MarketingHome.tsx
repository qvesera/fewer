import Link from "next/link";
import {
  Network,
  Keyboard,
  Shapes,
  Download,
  Share2,
  Cloud,
  BellRing,
  ShieldCheck,
  Github,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { APP_URL } from "./MarketingLayout";
import { buttonVariants } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Network,
    title: "Visualize any directory",
    body: "Import from your disk, a pasted ASCII tree, JSON, a Git repo URL, a crawled file index, or a connected cloud account — and get a live interactive graph.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-first navigation",
    body: "Move through the tree with arrow keys, search across every node, and jump around with shortcuts. No mouse required once you're in the flow.",
  },
  {
    icon: Shapes,
    title: "Explore & edit",
    body: "Pan and zoom a React Flow canvas, auto-layout folders with type-aware sizing, and add, rename, or delete nodes right on the graph.",
  },
  {
    icon: Download,
    title: "Export in 7 formats",
    body: "Save your graph as SVG, PNG, JSON, CSV, DOT, and more — tuned for diagrams, docs, and presentations.",
  },
  {
    icon: Share2,
    title: "Share with one link",
    body: "Compress small graphs into the URL or create a short server-backed link. Invite-only sharing for larger graphs.",
  },
  {
    icon: Cloud,
    title: "Connect your cloud",
    body: "Optional OAuth connections to GitHub, Google Drive, OneDrive, SharePoint, Azure DevOps, and Azure Blob to browse remote trees.",
  },
  {
    icon: BellRing,
    title: "Watch for changes",
    body: "Keep an eye on public file indexes and get a daily email digest when they change — perfect for assets and release packs.",
  },
  {
    icon: Sparkles,
    title: "Custom themes",
    body: "Tune colors for folders and files, or pick a preset. Your graph, your look.",
  },
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
