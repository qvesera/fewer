import Link from "next/link";
import { Github, ShieldCheck, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Public app origin used by the CTA + share/cloud OAuth URLs. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://app.fewer.directory";

const NAV = [
  { label: "Features", href: "/welcome#features" },
  { label: "Privacy", href: "/privacy" },
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
];

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Aurora Haze background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="gm-canvas-aurora" />
        <div className="gm-canvas-aurora-3" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 relative z-20 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo_flat.svg" alt="fewer logo" className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight">fewer</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <a
              href="https://github.com/qvesera/fewer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <Link
            href={APP_URL}
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            Launch the app
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10">{children}</main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-background/95">
        <div className="mx-auto max-w-6xl px-6 py-10 grid gap-10 md:grid-cols-3">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo_flat.svg" alt="fewer logo" className="h-7 w-7" />
              <span className="text-base font-bold tracking-tight">fewer</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs">
              Turn any directory into an interactive graph you can explore, edit, and export.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href={APP_URL} className="text-foreground/80 hover:text-foreground">
                  Launch the app
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-foreground/80 hover:text-foreground">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-foreground/80 hover:text-foreground">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Legal &amp; Source
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/docs/terms" className="text-foreground/80 hover:text-foreground">
                  Terms of Use
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/qvesera/fewer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground"
                >
                  <Github className="h-4 w-4" />
                  GitHub · AGPLv3
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/40">
          <div className="mx-auto max-w-6xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} fewer · fewer.directory</p>
            <p>The app runs at app.fewer.directory</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
