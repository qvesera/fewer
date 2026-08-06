import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Aurora Haze background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="gm-canvas-aurora" />
        <div className="gm-canvas-aurora-3" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          404
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight sm:text-6xl">
          Page not found
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          The page you're looking for doesn't exist, was moved, or never made it
          into the graph. Try heading back home or browsing the docs.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            ← Back to home
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Browse docs
          </Link>
        </div>
      </div>
    </div>
  );
}