import { Download, FolderInput, Keyboard } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * Three steps, one line each (T-150). The job of this section is to answer
 * "how do I use it" before the capability stories answer "what can it do";
 * deliberately no copy here repeats a phrase the marketing e2e pins.
 */
const STEPS = [
  {
    icon: FolderInput,
    title: "Point it at a folder",
    body: "Open a directory from disk, paste a tree, or bring in JSON, CSV, DOT, an archive, a URL, or a repo from GitHub.",
  },
  {
    icon: Keyboard,
    title: "Explore and edit",
    body: "Arrow-key through the tree, jump anywhere with search, group cards, rename and re-arrange. Each view keeps its own undo history.",
  },
  {
    icon: Download,
    title: "Export and share",
    body: "Take it out as SVG, PNG, JSON, CSV, DOT, a shell script, an ASCII tree, or a .fwr document, or share a link.",
  },
];

export function HowItWorks() {
  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Three steps, and none of them involve installing anything.
          </p>
        </Reveal>

        <ol className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="h-full">
              <Reveal delay={i * 90} className="h-full">
                <div className="h-full rounded-xl border border-border/60 bg-card/50 p-6">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  <step.icon className="mt-3 h-6 w-6 text-fewer-folder-icon" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
